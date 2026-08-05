import {
  EMPTY_PROVIDER_USAGE_STATE,
  ProviderDriverKind,
  ProviderInstanceId,
  type ProviderUsageState,
} from "@t3tools/contracts";
import { assert, it } from "vite-plus/test";

import { applyUsageEvent } from "./ProviderUsage.ts";

const CLAUDE = ProviderDriverKind.make("claudeAgent");
const CODEX = ProviderDriverKind.make("codex");
const OBSERVED_AT = "2026-08-05T12:00:00.000Z";
const LATER = "2026-08-05T12:05:00.000Z";

const claudeEvent = (rateLimitType: string, utilization: number) => ({
  rate_limit_info: { rateLimitType, utilization },
});

it("accumulates the Claude windows that arrive one event at a time", () => {
  const first = applyUsageEvent(EMPTY_PROVIDER_USAGE_STATE, {
    provider: CLAUDE,
    providerInstanceId: undefined,
    payload: claudeEvent("five_hour", 0.27),
    observedAt: OBSERVED_AT,
  });
  assert.ok(first);

  const second = applyUsageEvent(first, {
    provider: CLAUDE,
    providerInstanceId: undefined,
    payload: claudeEvent("seven_day", 0.03),
    observedAt: LATER,
  });
  assert.ok(second);

  assert.equal(second.providers.length, 1);
  assert.deepEqual(
    second.providers[0]?.windows.map((window) => [window.label, window.usedPercent]),
    [
      ["5h", 27],
      ["week", 3],
    ],
  );
  assert.equal(second.providers[0]?.updatedAt, LATER);
});

it("keeps each provider in its own snapshot", () => {
  const withClaude = applyUsageEvent(EMPTY_PROVIDER_USAGE_STATE, {
    provider: CLAUDE,
    providerInstanceId: undefined,
    payload: claudeEvent("five_hour", 0.27),
    observedAt: OBSERVED_AT,
  });
  assert.ok(withClaude);

  const withCodex = applyUsageEvent(withClaude, {
    provider: CODEX,
    providerInstanceId: undefined,
    payload: { rateLimits: { primary: { usedPercent: 31, windowDurationMins: 300 } } },
    observedAt: OBSERVED_AT,
  });
  assert.ok(withCodex);

  assert.deepEqual(
    withCodex.providers.map((snapshot) => snapshot.provider as string),
    ["claudeAgent", "codex"],
  );
});

it("separates instances of the same driver", () => {
  const withDefault = applyUsageEvent(EMPTY_PROVIDER_USAGE_STATE, {
    provider: CLAUDE,
    providerInstanceId: undefined,
    payload: claudeEvent("five_hour", 0.27),
    observedAt: OBSERVED_AT,
  });
  assert.ok(withDefault);

  const withSecond = applyUsageEvent(withDefault, {
    provider: CLAUDE,
    providerInstanceId: ProviderInstanceId.make("work"),
    payload: claudeEvent("five_hour", 0.8),
    observedAt: OBSERVED_AT,
  });
  assert.ok(withSecond);

  assert.equal(withSecond.providers.length, 2);
  assert.equal(withSecond.providers[1]?.providerInstanceId, "work");
  assert.equal(withSecond.providers[0]?.windows[0]?.usedPercent, 27);
});

it("carries a previously reported plan through a payload that omits it", () => {
  const withPlan = applyUsageEvent(EMPTY_PROVIDER_USAGE_STATE, {
    provider: CODEX,
    providerInstanceId: undefined,
    payload: { rateLimits: { planType: "pro", primary: { usedPercent: 10 } } },
    observedAt: OBSERVED_AT,
  });
  assert.ok(withPlan);
  assert.equal(withPlan.providers[0]?.planLabel, "pro");

  const withoutPlan = applyUsageEvent(withPlan, {
    provider: CODEX,
    providerInstanceId: undefined,
    payload: { rateLimits: { primary: { usedPercent: 12 } } },
    observedAt: LATER,
  });
  assert.equal(withoutPlan?.providers[0]?.planLabel, "pro");
});

it("leaves the state untouched when a payload reports nothing usable", () => {
  const state: ProviderUsageState = EMPTY_PROVIDER_USAGE_STATE;

  assert.equal(
    applyUsageEvent(state, {
      provider: CLAUDE,
      providerInstanceId: undefined,
      payload: { rate_limit_info: { status: "allowed" } },
      observedAt: OBSERVED_AT,
    }),
    null,
  );
});
