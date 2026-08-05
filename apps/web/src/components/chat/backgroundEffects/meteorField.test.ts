import { describe, expect, it } from "vite-plus/test";

import { buildMeteorField, type MeteorFieldConfig } from "./meteorField";

const CONFIG: MeteorFieldConfig = {
  count: 12,
  angleDegrees: 145,
  travelPx: 900,
  tailPx: 56,
  minDelaySeconds: 0,
  maxDelaySeconds: 6,
  minDurationSeconds: 5,
  maxDurationSeconds: 12,
  seed: 0x7e3c,
};

describe("buildMeteorField", () => {
  it("is stable for a seed so re-renders never restart the field", () => {
    expect(buildMeteorField(CONFIG)).toEqual(buildMeteorField(CONFIG));
  });

  it("keeps delays and durations inside the configured range", () => {
    const field = buildMeteorField(CONFIG);

    expect(field.meteors).toHaveLength(CONFIG.count);
    for (const meteor of field.meteors) {
      expect(meteor.delaySeconds).toBeGreaterThanOrEqual(CONFIG.minDelaySeconds);
      expect(meteor.delaySeconds).toBeLessThanOrEqual(CONFIG.maxDelaySeconds);
      expect(meteor.durationSeconds).toBeGreaterThanOrEqual(CONFIG.minDurationSeconds);
      expect(meteor.durationSeconds).toBeLessThanOrEqual(CONFIG.maxDurationSeconds);
    }
  });

  it("spreads spawn points past the top and right edges", () => {
    const field = buildMeteorField({ ...CONFIG, count: 60 });
    const lefts = field.meteors.map((meteor) => meteor.leftPercent);
    const tops = field.meteors.map((meteor) => meteor.topPercent);

    expect(Math.min(...lefts)).toBeLessThan(0);
    expect(Math.max(...lefts)).toBeGreaterThan(100);
    expect(Math.min(...tops)).toBeLessThan(0);
  });

  it("resolves the travel vector down and to the left at 145 degrees", () => {
    const field = buildMeteorField(CONFIG);

    expect(field.travelXPx).toBeLessThan(0);
    // Positive y is down the screen.
    expect(field.travelYPx).toBeGreaterThan(0);
  });

  it("draws nothing for a zero count", () => {
    expect(buildMeteorField({ ...CONFIG, count: 0 }).meteors).toEqual([]);
  });
});
