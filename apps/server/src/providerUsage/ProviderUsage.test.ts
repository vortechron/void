import {
  EMPTY_PROVIDER_USAGE_STATE,
  ProviderDriverKind,
  ProviderInstanceId,
  type ServerProvider,
  type ServerProviderUsageLimits,
} from "@t3tools/contracts";
import { assert, it } from "vite-plus/test";

import { applyProviderSnapshots } from "./ProviderUsage.ts";

const CODEX = ProviderDriverKind.make("codex");
const CHECKED_AT = "2026-09-09T08:00:00.000Z";
const LATER = "2026-09-09T08:05:00.000Z";

const provider = (input: {
  readonly driver?: ProviderDriverKind;
  readonly instanceId?: string;
  readonly usageLimits?: ServerProviderUsageLimits;
}): ServerProvider => ({
  instanceId: ProviderInstanceId.make(input.instanceId ?? "codex"),
  driver: input.driver ?? CODEX,
  enabled: true,
  installed: true,
  version: "0.153.4",
  status: "ready",
  auth: { status: "authenticated" },
  checkedAt: CHECKED_AT,
  models: [],
  slashCommands: [],
  skills: [],
  ...(input.usageLimits ? { usageLimits: input.usageLimits } : {}),
});

const weekly = (usedPercent: number, checkedAt: string): ServerProviderUsageLimits => ({
  checkedAt,
  windows: [
    { id: "primary", kind: "weekly", label: "Weekly", usedPercent, windowDurationMins: 10_080 },
  ],
});

it("projects the windows a provider publishes onto a meter column", () => {
  const next = applyProviderSnapshots(EMPTY_PROVIDER_USAGE_STATE, [
    provider({ usageLimits: weekly(40, CHECKED_AT) }),
  ]);

  assert.deepEqual(
    next.providers[0]?.windows.map((window) => [window.label, window.usedPercent]),
    [["week", 40]],
  );
  assert.equal(next.providers[0]?.updatedAt, CHECKED_AT);
});

it("retires a window the provider stopped reporting", () => {
  // Codex dropped the five-hour bucket for this plan. Carrying it forward left
  // a column stuck at a percentage from a window that ended days ago.
  const withSession = applyProviderSnapshots(EMPTY_PROVIDER_USAGE_STATE, [
    provider({
      usageLimits: {
        checkedAt: CHECKED_AT,
        windows: [
          {
            id: "primary",
            kind: "session",
            label: "Session",
            usedPercent: 0,
            windowDurationMins: 300,
          },
          {
            id: "secondary",
            kind: "weekly",
            label: "Weekly",
            usedPercent: 7,
            windowDurationMins: 10_080,
          },
        ],
      },
    }),
  ]);
  assert.equal(withSession.providers[0]?.windows.length, 2);

  const weeklyOnly = applyProviderSnapshots(withSession, [
    provider({ usageLimits: weekly(40, LATER) }),
  ]);

  assert.deepEqual(
    weeklyOnly.providers[0]?.windows.map((window) => window.label),
    ["week"],
  );
});

it("keeps the last good numbers when a probe fails", () => {
  const good = applyProviderSnapshots(EMPTY_PROVIDER_USAGE_STATE, [
    provider({ usageLimits: weekly(40, CHECKED_AT) }),
  ]);

  const afterFailure = applyProviderSnapshots(good, [
    provider({
      usageLimits: {
        checkedAt: LATER,
        windows: [],
        unavailable: { reason: "probeFailed", message: "Codex did not answer." },
      },
    }),
  ]);

  assert.equal(afterFailure, good);
});

it("clears the column for an account that can never report windows", () => {
  const good = applyProviderSnapshots(EMPTY_PROVIDER_USAGE_STATE, [
    provider({ usageLimits: weekly(40, CHECKED_AT) }),
  ]);

  const afterApiKey = applyProviderSnapshots(good, [
    provider({
      usageLimits: { checkedAt: LATER, windows: [], unavailable: { reason: "unsupported" } },
    }),
  ]);

  assert.deepEqual(afterApiKey.providers, []);
});

it("leaves the state untouched when a provider has not been read yet", () => {
  const good = applyProviderSnapshots(EMPTY_PROVIDER_USAGE_STATE, [
    provider({ usageLimits: weekly(40, CHECKED_AT) }),
  ]);

  assert.equal(applyProviderSnapshots(good, [provider({})]), good);
});

it("returns the same state when a registry change carries no new usage", () => {
  const first = applyProviderSnapshots(EMPTY_PROVIDER_USAGE_STATE, [
    provider({ usageLimits: weekly(40, CHECKED_AT) }),
  ]);

  const repeated = applyProviderSnapshots(first, [
    provider({ usageLimits: weekly(40, CHECKED_AT) }),
  ]);

  assert.equal(repeated, first);
});

it("keeps instances of the same driver apart", () => {
  const next = applyProviderSnapshots(EMPTY_PROVIDER_USAGE_STATE, [
    provider({ usageLimits: weekly(40, CHECKED_AT) }),
    provider({ instanceId: "work", usageLimits: weekly(12, CHECKED_AT) }),
  ]);

  assert.equal(next.providers.length, 2);
  assert.equal(next.providers[1]?.providerInstanceId, "work");
  assert.equal(next.providers[0]?.windows[0]?.usedPercent, 40);
});
