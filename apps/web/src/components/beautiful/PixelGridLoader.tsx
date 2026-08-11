/* ─────────────────────────────────────────────────────────
 * PIXEL GRID LOADER
 *
 * The 3×3 wavefront from the Beautiful UI loading primitive,
 * split out so both the gallery demo and the real chat
 * timeline draw the same glyph.
 *
 * Drive — square cells, chevron wavefront driving right; the
 *         650ms cycle is shorter than the sweep, so two
 *         fronts are always in flight
 * Dots  — same wavefront, circular cells
 * Orbit — a comet lapping the grid perimeter
 *
 * Reduced motion freezes the grid to its dim state.
 * ───────────────────────────────────────────────────────── */

const chevron = Array.from({ length: 9 }, (_, i) => {
  const r = Math.floor(i / 3),
    c = i % 3;
  return (c + Math.abs(r - 1)) * 90;
});

const ORBIT_ORDER = [0, 1, 2, 5, 8, 7, 6, 3];
const orbit = Array.from({ length: 9 }, (_, i) => {
  const k = ORBIT_ORDER.indexOf(i);
  return k === -1 ? null : k * 110;
});

export type LoadingVariant = "Drive" | "Dots" | "Orbit";

export const PIXEL_PATTERNS: Record<
  LoadingVariant,
  { delays: (number | null)[]; dur: number; round: boolean }
> = {
  Drive: { delays: chevron, dur: 650, round: false },
  Dots: { delays: chevron, dur: 650, round: true },
  Orbit: { delays: orbit, dur: 950, round: false },
};

export function PixelGridLoader({
  variant = "Drive",
  className = "",
}: {
  variant?: LoadingVariant;
  className?: string;
}) {
  const { delays, dur, round } = PIXEL_PATTERNS[variant];

  return (
    <span
      aria-hidden
      className={`grid grid-cols-[repeat(3,4px)] gap-[1.5px] motion-reduce:*:!animate-none ${className}`}
    >
      {delays.map((d, i) => (
        <span
          key={i}
          className={`size-[4px] bg-current ${round ? "rounded-full" : "rounded-[1px]"}`}
          style={{
            opacity: d === null ? 0.07 : 0.15,
            animation: d === null ? "none" : `pixel-on ${dur}ms ease-in-out ${d}ms infinite`,
          }}
        />
      ))}
    </span>
  );
}
