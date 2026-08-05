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
