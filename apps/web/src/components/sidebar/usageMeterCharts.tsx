/**
 * The five shapes the usage meter can draw for one window.
 *
 * Every one of them takes an already-resolved percentage and color: whether
 * the number means "spent" or "left", and whether the window is near
 * exhaustion, is decided once in `SidebarUsageMeters.logic` rather than five
 * times here.
 */
import type { UsageMeterChartStyle } from "@t3tools/contracts";
import { memo } from "react";

import { sparklinePoints } from "./SidebarUsageMeters.logic";

const RING_RADIUS = 9;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const STEP_COUNT = 10;

export const USAGE_TRACK_COLOR =
  "color-mix(in oklab, var(--color-muted-foreground) 22%, transparent)";

export interface UsageChartProps {
  /** Null when the provider named the window but not how much of it is spent. */
  readonly percent: number | null;
  readonly color: string;
}

/**
 * An unreported percentage draws the track only, so no shape ever implies a
 * fullness the provider never stated.
 */
const clampPercent = (percent: number | null): number => Math.min(100, Math.max(0, percent ?? 0));

export const UsageRingChart = memo(function UsageRingChart({ percent, color }: UsageChartProps) {
  const dashOffset = RING_CIRCUMFERENCE * (1 - clampPercent(percent) / 100);

  return (
    <svg aria-hidden className="-rotate-90 size-[22px] shrink-0 transform-gpu" viewBox="0 0 24 24">
      <circle
        cx="12"
        cy="12"
        r={RING_RADIUS}
        fill="none"
        stroke={USAGE_TRACK_COLOR}
        strokeWidth="2"
      />
      <circle
        className="transition-[stroke-dashoffset,stroke] duration-500 ease-out motion-reduce:transition-none"
        cx="12"
        cy="12"
        r={RING_RADIUS}
        fill="none"
        stroke={percent === null ? "transparent" : color}
        strokeDasharray={RING_CIRCUMFERENCE}
        strokeDashoffset={dashOffset}
        strokeLinecap="round"
        strokeWidth="2"
      />
    </svg>
  );
});

export const UsageBarChart = memo(function UsageBarChart({ percent, color }: UsageChartProps) {
  return (
    <div
      aria-hidden
      className="h-1 w-full overflow-hidden rounded-full"
      style={{ backgroundColor: USAGE_TRACK_COLOR }}
    >
      <div
        className="h-full rounded-full transition-[width,background-color] duration-500 ease-out motion-reduce:transition-none"
        style={{
          width: `${clampPercent(percent)}%`,
          backgroundColor: percent === null ? "transparent" : color,
        }}
      />
    </div>
  );
});

export const UsageSteppedChart = memo(function UsageSteppedChart({
  percent,
  color,
}: UsageChartProps) {
  const value = clampPercent(percent);

  return (
    <div aria-hidden className="flex w-full items-center gap-px">
      {Array.from({ length: STEP_COUNT }, (_unused, index) => {
        // A step lights as soon as the value enters its band, so a small but
        // non-zero reading is visible instead of rounding away to nothing.
        const isLit = percent !== null && value > index * (100 / STEP_COUNT);
        return (
          <span
            className="h-1.5 min-w-0 flex-1 rounded-[1px] transition-colors duration-300 motion-reduce:transition-none"
            key={index}
            style={{ backgroundColor: isLit ? color : USAGE_TRACK_COLOR }}
          />
        );
      })}
    </div>
  );
});

export const UsageSparklineChart = memo(function UsageSparklineChart({
  color,
  samples,
}: {
  readonly color: string;
  readonly samples: ReadonlyArray<number>;
}) {
  const points = sparklinePoints(samples);
  // One reading is a dot, not a trend. The caller falls back to a bar before
  // this renders, but guard anyway so a stray single sample draws nothing.
  if (points.length < 2) return null;

  const path = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x * 100} ${point.y * 20}`)
    .join(" ");
  const last = points[points.length - 1];

  return (
    <svg aria-hidden className="h-5 w-full" preserveAspectRatio="none" viewBox="-1 -1 102 22">
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
      />
      {last ? <circle cx={last.x * 100} cy={last.y * 20} fill={color} r="1.5" /> : null}
    </svg>
  );
});

/**
 * Renders the configured style, falling back to a bar when a sparkline has no
 * series yet — a blank slot next to a number reads as a broken meter.
 */
export function UsageChart({
  chartStyle,
  percent,
  color,
  samples,
}: UsageChartProps & {
  readonly chartStyle: UsageMeterChartStyle;
  readonly samples: ReadonlyArray<number>;
}) {
  switch (chartStyle) {
    case "numeric":
      return null;
    case "ring":
      return <UsageRingChart color={color} percent={percent} />;
    case "stepped":
      return <UsageSteppedChart color={color} percent={percent} />;
    case "sparkline":
      return samples.length >= 2 ? (
        <UsageSparklineChart color={color} samples={samples} />
      ) : (
        <UsageBarChart color={color} percent={percent} />
      );
    case "bar":
      return <UsageBarChart color={color} percent={percent} />;
  }
}
