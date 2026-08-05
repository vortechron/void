import { ProviderDriverKind, type ProviderUsageState } from "@t3tools/contracts";
import { assert, it } from "vite-plus/test";

import {
  formatResetCountdown,
  formatSyncedLabel,
  formatUsagePercent,
  latestSyncedAt,
  selectUsageColumns,
} from "./SidebarUsageMeters.logic";

const NOW = Date.parse("2026-08-05T12:00:00.000Z");
const at = (offsetMs: number) => new Date(NOW + offsetMs).toISOString();

it("counts down to a reset in hours below a day", () => {
  assert.equal(formatResetCountdown(at(4 * 60 * 60 * 1000), NOW), "resets in 4h");
});

it("keeps the hour remainder once a reset is days away", () => {
  const remaining = 3 * 24 * 60 * 60 * 1000 + 19 * 60 * 60 * 1000;
  assert.equal(formatResetCountdown(at(remaining), NOW), "resets in 3d 19h");
});

it("drops a zero hour remainder", () => {
  assert.equal(formatResetCountdown(at(6 * 24 * 60 * 60 * 1000), NOW), "resets in 6d");
});

it("falls back to minutes under an hour and never rounds down to zero", () => {
  assert.equal(formatResetCountdown(at(9 * 60 * 1000), NOW), "resets in 9m");
  assert.equal(formatResetCountdown(at(5 * 1000), NOW), "resets in 1m");
});

it("reports an elapsed reset instead of a negative countdown", () => {
  assert.equal(formatResetCountdown(at(-60_000), NOW), "resets now");
});

it("returns null for a missing or unparseable reset", () => {
  assert.equal(formatResetCountdown(undefined, NOW), null);
  assert.equal(formatResetCountdown("tomorrow", NOW), null);
});

it("labels sync staleness in the largest fitting unit", () => {
  assert.equal(formatSyncedLabel(at(-30_000), NOW), "Synced just now");
  assert.equal(formatSyncedLabel(at(-4 * 60 * 1000), NOW), "Synced 4 min ago");
  assert.equal(formatSyncedLabel(at(-3 * 60 * 60 * 1000), NOW), "Synced 3h ago");
  assert.equal(formatSyncedLabel(at(-50 * 60 * 60 * 1000), NOW), "Synced 2d ago");
  assert.equal(formatSyncedLabel(undefined, NOW), null);
});

const makeState = (): ProviderUsageState => ({
  providers: [
    {
      provider: ProviderDriverKind.make("codex"),
      windows: [
        {
          key: "window_300",
          label: "5h",
          usedPercent: 31.4,
          resetsAt: at(4 * 60 * 60 * 1000),
          updatedAt: at(-2 * 60 * 1000),
        },
      ],
      updatedAt: at(-2 * 60 * 1000),
    },
    {
      provider: ProviderDriverKind.make("claudeAgent"),
      windows: [
        { key: "five_hour", label: "5h", usedPercent: 27, updatedAt: at(-9 * 60 * 1000) },
        { key: "seven_day", label: "week", usedPercent: 3, updatedAt: at(-9 * 60 * 1000) },
      ],
      updatedAt: at(-9 * 60 * 1000),
    },
  ],
});

it("orders Claude ahead of Codex regardless of arrival order", () => {
  const columns = selectUsageColumns(makeState(), NOW);

  assert.deepEqual(
    columns.map((column) => column.provider as string),
    ["claudeAgent", "codex"],
  );
  assert.equal(columns[0]?.windows.length, 2);
  assert.equal(columns[1]?.windows[0]?.resetsLabel, "resets in 4h");
});

it("drops providers that reported no windows", () => {
  const columns = selectUsageColumns(
    {
      providers: [
        { provider: ProviderDriverKind.make("cursor"), windows: [], updatedAt: at(0) },
        ...makeState().providers,
      ],
    },
    NOW,
  );

  assert.equal(columns.length, 2);
  assert.equal(
    columns.some((column) => (column.provider as string) === "cursor"),
    false,
  );
});

it("returns no columns without state", () => {
  assert.deepEqual(selectUsageColumns(null, NOW), []);
});

it("reports the freshest sync across columns", () => {
  const columns = selectUsageColumns(makeState(), NOW);

  assert.equal(formatSyncedLabel(latestSyncedAt(columns), NOW), "Synced 2 min ago");
  assert.equal(latestSyncedAt([]), undefined);
});

it("rounds percentages for display", () => {
  assert.equal(formatUsagePercent(31.4), "31");
  assert.equal(formatUsagePercent(0), "0");
});
