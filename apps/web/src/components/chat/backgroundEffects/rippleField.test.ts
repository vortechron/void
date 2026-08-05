import { describe, expect, it } from "vite-plus/test";

import { buildRippleField, type RippleFieldConfig } from "./rippleField";

const CONFIG: RippleFieldConfig = {
  count: 5,
  baseInsetPx: 14,
  insetStepPx: 26,
  boxRadiusPx: 22,
  baseOpacity: 0.22,
  opacityStep: 0.04,
  minOpacity: 0.02,
  durationSeconds: 3.2,
  delayStepSeconds: 0.16,
};

describe("buildRippleField", () => {
  it("steps each ring further outside the box", () => {
    const field = buildRippleField(CONFIG);

    expect(field.rings).toHaveLength(CONFIG.count);
    for (const [index, ring] of field.rings.entries()) {
      expect(ring.insetPx).toBe(CONFIG.baseInsetPx + index * CONFIG.insetStepPx);
    }
  });

  it("grows the corner radius with the offset so rings stay parallel to the box", () => {
    for (const ring of buildRippleField(CONFIG).rings) {
      expect(ring.borderRadiusPx).toBe(CONFIG.boxRadiusPx + ring.insetPx);
    }
  });

  it("fades and staggers outward so the rings read as one wave", () => {
    const field = buildRippleField(CONFIG);

    for (const [index, ring] of field.rings.entries()) {
      if (index === 0) continue;
      const inner = field.rings[index - 1]!;
      expect(ring.opacity).toBeLessThanOrEqual(inner.opacity);
      expect(ring.delaySeconds).toBeGreaterThan(inner.delaySeconds);
    }
  });

  it("holds opacity at the floor instead of running negative on a long field", () => {
    const field = buildRippleField({ ...CONFIG, count: 40 });

    for (const ring of field.rings) {
      expect(ring.opacity).toBeGreaterThanOrEqual(CONFIG.minOpacity);
      expect(ring.opacity).toBeLessThanOrEqual(CONFIG.baseOpacity);
    }
  });

  it("draws nothing for a zero count", () => {
    expect(buildRippleField({ ...CONFIG, count: 0 }).rings).toEqual([]);
  });
});
