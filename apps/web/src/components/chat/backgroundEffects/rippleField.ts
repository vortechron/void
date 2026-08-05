/**
 * Ring geometry for the ripple aura around the composer.
 *
 * The rings are not circles — they are the composer's own rounded rectangle,
 * repeated further and further outside it, so the glow reads as coming off
 * that box rather than as a bullseye sitting behind it. Each ring is one
 * outward offset from the box, which is all the geometry a CSS `inset` needs;
 * keeping it pure makes the fade and the corner tracking testable.
 */

export interface RippleFieldConfig {
  readonly count: number;
  /** How far outside the box the innermost ring sits, in CSS pixels. */
  readonly baseInsetPx: number;
  /** Added to the offset for each ring further out. */
  readonly insetStepPx: number;
  /** Corner radius of the box being surrounded, in CSS pixels. */
  readonly boxRadiusPx: number;
  readonly baseOpacity: number;
  /** Subtracted from the opacity for each ring further out. */
  readonly opacityStep: number;
  /**
   * Floor for the fade. Without it a long enough field runs the opacity past
   * zero into negative numbers, which browsers clamp silently but which makes
   * the count and the fade impossible to tune independently.
   */
  readonly minOpacity: number;
  readonly durationSeconds: number;
  /** Offset between one ring's animation and the next, in seconds. */
  readonly delayStepSeconds: number;
}

export interface RippleRing {
  readonly key: string;
  /** Distance outside the box on every side. */
  readonly insetPx: number;
  /**
   * Grown in step with the offset so the ring stays parallel to the box
   * corners instead of pinching in as it moves out.
   */
  readonly borderRadiusPx: number;
  readonly opacity: number;
  readonly delaySeconds: number;
}

export interface RippleField {
  readonly durationSeconds: number;
  readonly rings: readonly RippleRing[];
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function buildRippleField(config: RippleFieldConfig): RippleField {
  const count = Math.max(0, Math.floor(config.count));

  const rings = Array.from({ length: count }, (_unused, index) => {
    const insetPx = Math.max(0, config.baseInsetPx + index * config.insetStepPx);
    const opacity = Math.max(config.minOpacity, config.baseOpacity - index * config.opacityStep);

    return {
      key: `ripple-${index}`,
      insetPx: roundTo(insetPx, 2),
      borderRadiusPx: roundTo(config.boxRadiusPx + insetPx, 2),
      opacity: roundTo(opacity, 3),
      delaySeconds: roundTo(index * config.delayStepSeconds, 2),
    } satisfies RippleRing;
  });

  return {
    durationSeconds: config.durationSeconds,
    rings,
  };
}
