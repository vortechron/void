import type {
  ProviderDriverKind,
  ProviderUsageState,
  ProviderUsageWindow,
  UsageMeterChartStyle,
  UsageMeterPercentageBasis,
} from "@t3tools/contracts";

const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** Providers the meter shows first, so the layout does not reshuffle by arrival order. */
const PROVIDER_DISPLAY_ORDER: ReadonlyArray<string> = ["claudeAgent", "codex"];

export interface UsageMeterWindow {
  readonly key: string;
  readonly label: string;
  /** Null when the provider named the window but not how much of it is spent. */
  readonly usedPercent: number | null;
  /** Written-out form, for the tooltip and other places that read as a sentence. */
  readonly resetsLabel: string | null;
  /** Prefix-less form of `resetsLabel`, for the meters themselves. */
  readonly resetsDuration: string | null;
}

export interface UsageMeterColumn {
  readonly id: string;
  readonly provider: ProviderDriverKind;
  readonly windows: ReadonlyArray<UsageMeterWindow>;
  readonly updatedAt: string;
}

const parseEpoch = (isoDate: string | undefined): number | null => {
  if (!isoDate) return null;
  const parsed = Date.parse(isoDate);
  return Number.isNaN(parsed) ? null : parsed;
};

/**
 * Bare time left before a window resets, e.g. "3d 19h". Past a day the hour
 * remainder is kept, because "3d" reads as far less urgent than "3d 19h".
 * This is what the meters show: a "resets in" prefix on every window just
 * repeats itself and crowds the columns.
 */
export function formatResetDuration(resetsAt: string | undefined, nowMs: number): string | null {
  const epoch = parseEpoch(resetsAt);
  if (epoch === null) return null;

  const remaining = epoch - nowMs;
  if (remaining <= 0) return "now";
  if (remaining < HOUR_MS) return `${Math.max(1, Math.round(remaining / MINUTE_MS))}m`;
  if (remaining < DAY_MS) return `${Math.floor(remaining / HOUR_MS)}h`;

  const days = Math.floor(remaining / DAY_MS);
  const hours = Math.floor((remaining % DAY_MS) / HOUR_MS);
  return hours === 0 ? `${days}d` : `${days}d ${hours}h`;
}

/** The same countdown written out for the tooltip, which has the room. */
export function formatResetCountdown(resetsAt: string | undefined, nowMs: number): string | null {
  const duration = formatResetDuration(resetsAt, nowMs);
  if (duration === null) return null;
  return duration === "now" ? "resets now" : `resets in ${duration}`;
}

/**
 * How stale the meter is. Providers only report usage mid-turn, so an idle
 * session legitimately shows an hours-old sync and the label has to say so.
 */
export function formatSyncedLabel(updatedAt: string | undefined, nowMs: number): string | null {
  const epoch = parseEpoch(updatedAt);
  if (epoch === null) return null;

  const elapsed = Math.max(0, nowMs - epoch);
  if (elapsed < MINUTE_MS) return "Synced just now";
  if (elapsed < HOUR_MS) return `Synced ${Math.floor(elapsed / MINUTE_MS)} min ago`;
  if (elapsed < DAY_MS) return `Synced ${Math.floor(elapsed / HOUR_MS)}h ago`;
  return `Synced ${Math.floor(elapsed / DAY_MS)}d ago`;
}

const providerRank = (provider: string): number => {
  const index = PROVIDER_DISPLAY_ORDER.indexOf(provider);
  return index === -1 ? PROVIDER_DISPLAY_ORDER.length : index;
};

const toMeterWindow = (window: ProviderUsageWindow, nowMs: number): UsageMeterWindow => ({
  key: window.key,
  label: window.label,
  usedPercent:
    window.usedPercent === undefined ? null : Math.min(100, Math.max(0, window.usedPercent)),
  resetsLabel: formatResetCountdown(window.resetsAt, nowMs),
  resetsDuration: formatResetDuration(window.resetsAt, nowMs),
});

/**
 * Projects the wire state into the columns the meter renders. Providers with
 * no windows are dropped rather than shown empty: a provider the user never
 * runs should not occupy half the widget.
 */
export function selectUsageColumns(
  state: ProviderUsageState | null,
  nowMs: number,
): ReadonlyArray<UsageMeterColumn> {
  if (!state) return [];

  return state.providers
    .filter((snapshot) => snapshot.windows.length > 0)
    .map((snapshot) => ({
      id: snapshot.providerInstanceId
        ? `${snapshot.provider}:${snapshot.providerInstanceId}`
        : snapshot.provider,
      provider: snapshot.provider,
      windows: snapshot.windows.map((window) => toMeterWindow(window, nowMs)),
      updatedAt: snapshot.updatedAt,
    }))
    .sort((left, right) => {
      const rankDelta = providerRank(left.provider) - providerRank(right.provider);
      return rankDelta === 0 ? left.id.localeCompare(right.id) : rankDelta;
    });
}

/** The freshest sync across every column, which is what the footer reports. */
export function latestSyncedAt(columns: ReadonlyArray<UsageMeterColumn>): string | undefined {
  let latest: string | undefined;
  let latestEpoch = Number.NEGATIVE_INFINITY;
  for (const column of columns) {
    const epoch = parseEpoch(column.updatedAt);
    if (epoch !== null && epoch > latestEpoch) {
      latestEpoch = epoch;
      latest = column.updatedAt;
    }
  }
  return latest;
}

/**
 * Percentages render without decimals; the ring carries the finer detail. An
 * unreported percentage shows an em dash rather than a zero, which would read
 * as "nothing used" when the truth is "not told".
 */
export function formatUsagePercent(usedPercent: number | null): string {
  return usedPercent === null ? "—" : `${Math.round(usedPercent)}`;
}

/**
 * The number the meter puts on screen. Providers only ever report how much of
 * a window is spent, so "remaining" is that figure inverted rather than a
 * second thing to fetch. An unreported window stays unreported either way —
 * inverting `null` into 100% left would be an outright fabrication.
 */
export function resolveDisplayPercent(
  usedPercent: number | null,
  basis: UsageMeterPercentageBasis,
): number | null {
  if (usedPercent === null) return null;
  return basis === "remaining" ? 100 - usedPercent : usedPercent;
}

/** Past this the window is nearly spent, and the meter says so regardless of brand. */
export const EXHAUSTED_USED_PERCENT = 90;

/**
 * Whether the window is close enough to spent to warrant the alarm color. Keyed
 * off `usedPercent` rather than the displayed number so the "remaining" basis
 * turns red at the same real-world point as "used", not the mirror image of it.
 */
export function isExhaustedUsage(usedPercent: number | null): boolean {
  return usedPercent !== null && usedPercent >= EXHAUSTED_USED_PERCENT;
}

/**
 * Where a chart style sits relative to the number. A ring is small and square
 * enough to share the line; a bar, a segmented bar, and a sparkline all need
 * the column's full width, and `numeric` deliberately draws nothing at all.
 */
export function usageChartPlacement(chartStyle: UsageMeterChartStyle): "inline" | "below" | "none" {
  if (chartStyle === "numeric") return "none";
  return chartStyle === "ring" ? "inline" : "below";
}

// ── Sparkline history ────────────────────────────────────────────────
//
// Providers report a level, never a series, and the server caches only the
// latest snapshot. The sparkline therefore plots what this tab has watched
// happen since it loaded: honest about the trend, empty after a reload.

/** Enough points to show a shape in ~40px, few enough to stay cheap to hold. */
export const MAX_USAGE_SAMPLES = 24;

export type UsageSampleHistory = ReadonlyMap<string, ReadonlyArray<number>>;

export interface UsageSample {
  readonly key: string;
  readonly usedPercent: number | null;
}

/** Flattens the rendered columns into the per-window readings worth plotting. */
export function collectUsageSamples(
  columns: ReadonlyArray<UsageMeterColumn>,
): ReadonlyArray<UsageSample> {
  return columns.flatMap((column) =>
    column.windows.map((window) => ({
      key: `${column.id}:${window.key}`,
      usedPercent: window.usedPercent,
    })),
  );
}

/**
 * A stable fingerprint of the current readings. The meter re-renders every
 * minute to age its countdowns, and only a change in this string should append
 * a new point — otherwise the sparkline would fill with copies of one value.
 */
export function usageSampleSignature(samples: ReadonlyArray<UsageSample>): string {
  return samples.map((sample) => `${sample.key}=${sample.usedPercent ?? ""}`).join("|");
}

/**
 * Appends the readings to the history, dropping the oldest past the cap and
 * forgetting windows that are no longer reported. Returns `previous` untouched
 * when nothing moved, so storing the result cannot loop a React update.
 */
export function appendUsageSamples(
  previous: UsageSampleHistory,
  samples: ReadonlyArray<UsageSample>,
): UsageSampleHistory {
  const reported = samples.filter(
    (sample): sample is UsageSample & { usedPercent: number } => sample.usedPercent !== null,
  );
  if (reported.length === 0) {
    return previous.size === 0 ? previous : new Map();
  }

  const next = new Map<string, ReadonlyArray<number>>();
  let changed = previous.size !== reported.length;
  for (const sample of reported) {
    const history = previous.get(sample.key) ?? [];
    if (history[history.length - 1] === sample.usedPercent) {
      next.set(sample.key, history);
      continue;
    }
    changed = true;
    next.set(sample.key, [...history, sample.usedPercent].slice(-MAX_USAGE_SAMPLES));
  }

  return changed ? next : previous;
}

/**
 * Points for a sparkline path, normalized to a 0–1 box. A flat series is
 * centered rather than pinned to an edge, so "nothing changed" does not read
 * as "sitting at zero" or "maxed out".
 */
export function sparklinePoints(
  samples: ReadonlyArray<number>,
): ReadonlyArray<{ readonly x: number; readonly y: number }> {
  if (samples.length === 0) return [];
  if (samples.length === 1)
    return [
      { x: 0, y: 0.5 },
      { x: 1, y: 0.5 },
    ];

  const lowest = Math.min(...samples);
  const highest = Math.max(...samples);
  const span = highest - lowest;
  return samples.map((value, index) => ({
    x: index / (samples.length - 1),
    // SVG y grows downward, so a higher reading has to sit closer to 0.
    y: span === 0 ? 0.5 : 1 - (value - lowest) / span,
  }));
}
