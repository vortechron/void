/**
 * Placement math for the meteor background effect.
 *
 * Pure and seeded rather than `Math.random()` at render time: the layer
 * re-renders whenever the chat view around it does, and a fresh field would
 * restart every meteor mid-flight and read as a glitch. A seed also makes the
 * spread testable.
 */

export interface MeteorFieldConfig {
  readonly count: number;
  /**
   * Travel direction in degrees, clockwise from the +x axis with y pointing
   * down the screen. `145` falls down and to the left.
   */
  readonly angleDegrees: number;
  /** How far one meteor travels over its lifetime, in CSS pixels. */
  readonly travelPx: number;
  /** Length of the trail behind the head, in CSS pixels. */
  readonly tailPx: number;
  readonly minDelaySeconds: number;
  readonly maxDelaySeconds: number;
  readonly minDurationSeconds: number;
  readonly maxDurationSeconds: number;
  readonly seed: number;
}

export interface MeteorPlacement {
  readonly key: string;
  /** Spawn point as a percentage of the layer box; may sit outside 0–100. */
  readonly leftPercent: number;
  readonly topPercent: number;
  readonly delaySeconds: number;
  readonly durationSeconds: number;
}

export interface MeteorField {
  readonly travelXPx: number;
  readonly travelYPx: number;
  readonly angleDegrees: number;
  readonly tailPx: number;
  readonly meteors: readonly MeteorPlacement[];
}

/**
 * Meteors spawn in a band that overhangs the layer on the top and the right so
 * the visible area keeps filling from off-screen instead of every meteor
 * popping into existence inside the pane.
 */
const SPAWN_LEFT_PERCENT_MIN = -10;
const SPAWN_LEFT_PERCENT_MAX = 125;
const SPAWN_TOP_PERCENT_MIN = -25;
const SPAWN_TOP_PERCENT_MAX = 55;

/** mulberry32 — small, fast, and good enough for scattering dots. */
function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function buildMeteorField(config: MeteorFieldConfig): MeteorField {
  const random = createRandom(config.seed);
  const radians = (config.angleDegrees * Math.PI) / 180;
  const count = Math.max(0, Math.floor(config.count));

  const meteors = Array.from({ length: count }, (_unused, index) => {
    const leftPercent =
      SPAWN_LEFT_PERCENT_MIN + random() * (SPAWN_LEFT_PERCENT_MAX - SPAWN_LEFT_PERCENT_MIN);
    const topPercent =
      SPAWN_TOP_PERCENT_MIN + random() * (SPAWN_TOP_PERCENT_MAX - SPAWN_TOP_PERCENT_MIN);
    const delaySeconds =
      config.minDelaySeconds + random() * (config.maxDelaySeconds - config.minDelaySeconds);
    const durationSeconds =
      config.minDurationSeconds +
      random() * (config.maxDurationSeconds - config.minDurationSeconds);

    return {
      key: `meteor-${index}`,
      leftPercent: roundTo(leftPercent, 2),
      topPercent: roundTo(topPercent, 2),
      delaySeconds: roundTo(delaySeconds, 2),
      durationSeconds: roundTo(durationSeconds, 2),
    } satisfies MeteorPlacement;
  });

  return {
    travelXPx: roundTo(Math.cos(radians) * config.travelPx, 1),
    travelYPx: roundTo(Math.sin(radians) * config.travelPx, 1),
    angleDegrees: config.angleDegrees,
    tailPx: config.tailPx,
    meteors,
  };
}
