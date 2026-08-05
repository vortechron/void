import { assert, it } from "vite-plus/test";

import {
  epochToIso,
  formatWindowLabel,
  mergeUsageWindows,
  normalizeProviderUsagePayload,
} from "./normalize.ts";

const OBSERVED_AT = "2026-08-05T10:00:00.000Z";

it("scales the Claude 0-1 utilization fraction into a percentage", () => {
  const normalized = normalizeProviderUsagePayload(
    {
      type: "rate_limit_event",
      rate_limit_info: {
        status: "allowed",
        rateLimitType: "five_hour",
        utilization: 0.27,
        resetsAt: 1_785_000_000,
      },
    },
    OBSERVED_AT,
  );

  assert.deepEqual(normalized?.windows, [
    {
      key: "five_hour",
      label: "5h",
      usedPercent: 27,
      resetsAt: "2026-07-25T17:20:00.000Z",
      windowMinutes: 300,
      updatedAt: OBSERVED_AT,
    },
  ]);
});

it("labels the Claude seven day window as a week", () => {
  const normalized = normalizeProviderUsagePayload(
    { rate_limit_info: { rateLimitType: "seven_day", utilization: 0.03 } },
    OBSERVED_AT,
  );

  assert.equal(normalized?.windows[0]?.label, "week");
  assert.equal(normalized?.windows[0]?.usedPercent, 3);
  assert.equal(normalized?.windows[0]?.resetsAt, undefined);
});

it("reads both Codex windows from the nested snapshot", () => {
  const normalized = normalizeProviderUsagePayload(
    {
      rateLimits: {
        planType: "pro",
        primary: { usedPercent: 31, resetsAt: 1_785_000_000, windowDurationMins: 300 },
        secondary: { usedPercent: 12, windowDurationMins: 10_080 },
      },
    },
    OBSERVED_AT,
  );

  assert.equal(normalized?.planLabel, "pro");
  assert.deepEqual(
    normalized?.windows.map((window) => [window.key, window.label, window.usedPercent]),
    [
      ["window_300", "5h", 31],
      ["window_10080", "week", 12],
    ],
  );
});

it("accepts a Codex snapshot that is not double wrapped", () => {
  const normalized = normalizeProviderUsagePayload(
    { primary: { usedPercent: 8, windowDurationMins: 300 } },
    OBSERVED_AT,
  );

  assert.equal(normalized?.windows.length, 1);
  assert.equal(normalized?.windows[0]?.usedPercent, 8);
});

it("returns null when the payload carries no usable window", () => {
  assert.equal(normalizeProviderUsagePayload({ rateLimits: {} }, OBSERVED_AT), null);
  assert.equal(normalizeProviderUsagePayload({ rate_limit_info: {} }, OBSERVED_AT), null);
  assert.equal(normalizeProviderUsagePayload(null, OBSERVED_AT), null);
});

// Verbatim from ~/.t3/userdata/logs/provider: Claude withholds `utilization`
// until a threshold warning, so the common healthy event has no percentage.
it("keeps a Claude window that reports a reset but no utilization", () => {
  const normalized = normalizeProviderUsagePayload(
    {
      type: "rate_limit_event",
      rate_limit_info: {
        status: "allowed",
        resetsAt: 1_785_903_600,
        rateLimitType: "five_hour",
        overageStatus: "rejected",
        overageDisabledReason: "out_of_credits",
        isUsingOverage: false,
      },
    },
    OBSERVED_AT,
  );

  assert.equal(normalized?.windows.length, 1);
  assert.equal(normalized?.windows[0]?.label, "5h");
  assert.equal(normalized?.windows[0]?.usedPercent, undefined);
  assert.equal(normalized?.windows[0]?.resetsAt, "2026-08-05T04:20:00.000Z");
});

it("reads the percentage the Claude /usage snapshot reports for every window", () => {
  const normalized = normalizeProviderUsagePayload(
    {
      subscription_type: "max",
      rate_limits: {
        five_hour: { utilization: 41, resets_at: "2026-08-05T07:40:00Z" },
        seven_day: { utilization: 18.5, resets_at: "2026-08-09T00:00:00Z" },
        seven_day_opus: { utilization: 2, resets_at: "2026-08-09T00:00:00Z" },
      },
    },
    OBSERVED_AT,
  );

  assert.equal(normalized?.planLabel, "max");
  assert.deepEqual(
    normalized?.windows.map((window) => [window.key, window.label, window.usedPercent]),
    [
      ["five_hour", "5h", 41],
      ["seven_day", "week", 18.5],
      ["seven_day_opus", "opus", 2],
    ],
  );
  assert.equal(normalized?.windows[0]?.resetsAt, "2026-08-05T07:40:00.000Z");
});

// The percentage arrives scaled here, unlike the 0-1 fraction on the event, so
// a full window must survive as 100 rather than being clamped from 10000.
it("does not rescale the Claude /usage percentage", () => {
  const normalized = normalizeProviderUsagePayload(
    { rate_limits: { five_hour: { utilization: 100, resets_at: null } } },
    OBSERVED_AT,
  );

  assert.equal(normalized?.windows[0]?.usedPercent, 100);
  assert.equal(normalized?.windows[0]?.resetsAt, undefined);
});

it("skips Claude /usage windows the plan does not describe", () => {
  const normalized = normalizeProviderUsagePayload(
    {
      rate_limits: {
        five_hour: { utilization: 7, resets_at: "2026-08-05T07:40:00Z" },
        seven_day_sonnet: { utilization: null, resets_at: null },
        seven_day_opus: null,
      },
    },
    OBSERVED_AT,
  );

  assert.deepEqual(
    normalized?.windows.map((window) => window.key),
    ["five_hour"],
  );
});

// Dollar credits and other apps' spend are not windows of this plan's limits.
it("ignores the extra usage and oauth app fields of the Claude /usage snapshot", () => {
  assert.equal(
    normalizeProviderUsagePayload(
      {
        rate_limits: {
          seven_day_oauth_apps: { utilization: 12, resets_at: "2026-08-09T00:00:00Z" },
          extra_usage: { is_enabled: true, monthly_limit: 50, used_credits: 10, utilization: 20 },
        },
      },
      OBSERVED_AT,
    ),
    null,
  );
});

// `rate_limits` is null for API key, Bedrock and Vertex sessions.
it("returns null when the Claude /usage snapshot reports no plan limits", () => {
  assert.equal(
    normalizeProviderUsagePayload(
      { subscription_type: null, rate_limits_available: false, rate_limits: null },
      OBSERVED_AT,
    ),
    null,
  );
});

it("merges a polled percentage onto the window an event already reported", () => {
  const fromEvent = normalizeProviderUsagePayload(
    { rate_limit_info: { rateLimitType: "five_hour", resetsAt: 1_785_915_600 } },
    OBSERVED_AT,
  );
  const fromSnapshot = normalizeProviderUsagePayload(
    { rate_limits: { five_hour: { utilization: 63, resets_at: "2026-08-05T07:40:00Z" } } },
    OBSERVED_AT,
  );

  const merged = mergeUsageWindows(fromEvent?.windows ?? [], fromSnapshot?.windows ?? []);

  assert.equal(merged.length, 1);
  assert.equal(merged[0]?.key, "five_hour");
  assert.equal(merged[0]?.usedPercent, 63);
});

it("normalizes the Codex snapshot exactly as logged in production", () => {
  const normalized = normalizeProviderUsagePayload(
    {
      rateLimits: {
        credits: { balance: "0", hasCredits: false, unlimited: false },
        individualLimit: null,
        limitId: "codex",
        limitName: null,
        planType: "prolite",
        primary: { resetsAt: 1_786_450_195, usedPercent: 29, windowDurationMins: 10_080 },
        rateLimitReachedType: null,
        secondary: null,
        spendControlReached: null,
      },
    },
    OBSERVED_AT,
  );

  assert.equal(normalized?.planLabel, "prolite");
  assert.deepEqual(
    normalized?.windows.map((window) => [window.label, window.usedPercent]),
    [["week", 29]],
  );
});

it("carries a known percentage across events that omit it", () => {
  const merged = mergeUsageWindows(
    [
      {
        key: "five_hour",
        label: "5h",
        usedPercent: 92,
        resetsAt: "2026-08-05T15:00:00.000Z",
        updatedAt: OBSERVED_AT,
      },
    ],
    [
      {
        key: "five_hour",
        label: "5h",
        resetsAt: "2026-08-05T15:00:00.000Z",
        updatedAt: "2026-08-05T11:00:00.000Z",
      },
    ],
  );

  assert.equal(merged[0]?.usedPercent, 92);
});

it("drops a stale percentage once the window rolls over", () => {
  const merged = mergeUsageWindows(
    [
      {
        key: "five_hour",
        label: "5h",
        usedPercent: 92,
        resetsAt: "2026-08-05T15:00:00.000Z",
        updatedAt: OBSERVED_AT,
      },
    ],
    [
      {
        key: "five_hour",
        label: "5h",
        resetsAt: "2026-08-05T20:00:00.000Z",
        updatedAt: "2026-08-05T15:01:00.000Z",
      },
    ],
  );

  assert.equal(merged[0]?.usedPercent, undefined);
});

it("clamps percentages that overshoot the reportable range", () => {
  const normalized = normalizeProviderUsagePayload(
    { rate_limit_info: { rateLimitType: "five_hour", utilization: 1.4 } },
    OBSERVED_AT,
  );

  assert.equal(normalized?.windows[0]?.usedPercent, 100);
});

it("keeps windows the newest payload did not mention", () => {
  const merged = mergeUsageWindows(
    [
      {
        key: "five_hour",
        label: "5h",
        usedPercent: 27,
        windowMinutes: 300,
        updatedAt: OBSERVED_AT,
      },
      {
        key: "seven_day",
        label: "week",
        usedPercent: 3,
        windowMinutes: 10_080,
        updatedAt: OBSERVED_AT,
      },
    ],
    [
      {
        key: "five_hour",
        label: "5h",
        usedPercent: 41,
        windowMinutes: 300,
        updatedAt: "2026-08-05T11:00:00.000Z",
      },
    ],
  );

  assert.deepEqual(
    merged.map((window) => [window.key, window.usedPercent]),
    [
      ["five_hour", 41],
      ["seven_day", 3],
    ],
  );
});

it("treats millisecond epochs as already scaled", () => {
  assert.equal(epochToIso(1_785_000_000), "2026-07-25T17:20:00.000Z");
  assert.equal(epochToIso(1_785_000_000_000), "2026-07-25T17:20:00.000Z");
  assert.equal(epochToIso(0), undefined);
  assert.equal(epochToIso("soon"), undefined);
});

it("formats window labels from their duration", () => {
  assert.equal(formatWindowLabel(300, "session"), "5h");
  assert.equal(formatWindowLabel(10_080, "session"), "week");
  assert.equal(formatWindowLabel(30, "session"), "30m");
  assert.equal(formatWindowLabel(43_200, "session"), "30d");
  assert.equal(formatWindowLabel(undefined, "session"), "session");
});
