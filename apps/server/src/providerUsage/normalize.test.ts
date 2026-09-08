import type { ServerProviderUsageWindow } from "@t3tools/contracts";
import { assert, it } from "vite-plus/test";

import { formatWindowLabel, toMeterWindow } from "./normalize.ts";

const CHECKED_AT = "2026-09-09T08:00:00.000Z";

const window = (overrides: Partial<ServerProviderUsageWindow>): ServerProviderUsageWindow => ({
  id: "primary",
  kind: "weekly",
  label: "Weekly",
  usedPercent: 40,
  windowDurationMins: 10_080,
  ...overrides,
});

it("names a window by how long it runs", () => {
  assert.equal(formatWindowLabel(300, "Session"), "5h");
  assert.equal(formatWindowLabel(10_080, "Weekly"), "week");
  assert.equal(formatWindowLabel(30, "Half hour"), "30m");
  assert.equal(formatWindowLabel(43_200, "Monthly"), "30d");
  assert.equal(formatWindowLabel(undefined, "Extra"), "Extra");
});

it("projects a published window onto the meter's shape", () => {
  const projected = toMeterWindow(window({ resetsAt: "2026-09-15T01:24:45.000Z" }), CHECKED_AT);

  assert.deepEqual(projected, {
    key: "primary",
    label: "week",
    usedPercent: 40,
    resetsAt: "2026-09-15T01:24:45.000Z",
    windowMinutes: 10_080,
    updatedAt: CHECKED_AT,
  });
});

it("keeps only the model name from a model-scoped label", () => {
  // A model-scoped weekly runs as long as the plain weekly, so "week" would
  // draw two columns that read identically.
  const projected = toMeterWindow(
    window({ id: "seven_day_fable", label: "Weekly · Fable" }),
    CHECKED_AT,
  );

  assert.equal(projected.label, "Fable");
});

it("omits a duration the provider did not report", () => {
  const projected = toMeterWindow(
    window({ id: "overage", label: "Extra", windowDurationMins: undefined }),
    CHECKED_AT,
  );

  assert.equal(projected.label, "Extra");
  assert.equal(projected.windowMinutes, undefined);
});
