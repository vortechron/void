import type {
  ProviderDriverKind,
  ProviderUsageState,
  ProviderUsageWindow,
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
  readonly resetsLabel: string | null;
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
 * Countdown to a window reset. Past a day the hour remainder is kept, because
 * "resets in 3d" reads as far less urgent than "resets in 3d 19h".
 */
export function formatResetCountdown(resetsAt: string | undefined, nowMs: number): string | null {
  const epoch = parseEpoch(resetsAt);
  if (epoch === null) return null;

  const remaining = epoch - nowMs;
  if (remaining <= 0) return "resets now";
  if (remaining < HOUR_MS) return `resets in ${Math.max(1, Math.round(remaining / MINUTE_MS))}m`;
  if (remaining < DAY_MS) return `resets in ${Math.floor(remaining / HOUR_MS)}h`;

  const days = Math.floor(remaining / DAY_MS);
  const hours = Math.floor((remaining % DAY_MS) / HOUR_MS);
  return hours === 0 ? `resets in ${days}d` : `resets in ${days}d ${hours}h`;
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
