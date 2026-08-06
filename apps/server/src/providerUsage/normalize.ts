/**
 * Normalizes the provider-native `account.rate-limits.updated` payloads into
 * the shared `ProviderUsageWindow` shape.
 *
 * The two providers that report subscription usage disagree on everything:
 *
 * - Claude sends one window per event as `{ rate_limit_info: { rateLimitType,
 *   utilization, resetsAt } }`, where `utilization` is a 0-1 fraction.
 * - Codex sends a `{ rateLimits: { primary, secondary } }` snapshot where each
 *   window carries an already-scaled integer `usedPercent`.
 *
 * Dispatch is by payload shape rather than by driver kind so forks that rename
 * their driver still normalize correctly.
 */
import type { ProviderUsageWindow } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Option from "effect/Option";

const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = MINUTES_PER_HOUR * 24;
const MINUTES_PER_WEEK = MINUTES_PER_DAY * 7;

// Unix seconds vs milliseconds: any real timestamp in seconds is far below
// this bound, and any timestamp in milliseconds is far above it.
const MILLISECOND_EPOCH_BOUND = 1e12;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readNumber = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

const readString = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

// Two decimals is far finer than the meter renders, and rounding keeps the
// scaled Claude fraction free of float noise on the wire.
const clampPercent = (value: number): number =>
  Math.round(Math.min(100, Math.max(0, value)) * 100) / 100;

/** The `/usage` snapshot dates its windows in ISO, not epoch seconds. */
const readIsoDate = (value: unknown): string | undefined => {
  const text = readString(value);
  if (text === undefined) return undefined;
  return Option.match(DateTime.make(text), {
    onNone: () => undefined,
    onSome: (dateTime) => DateTime.formatIso(dateTime),
  });
};

/** Provider epochs arrive in seconds; tolerate milliseconds defensively. */
export const epochToIso = (value: unknown): string | undefined => {
  const epoch = readNumber(value);
  if (epoch === undefined || epoch <= 0) return undefined;
  const millis = epoch >= MILLISECOND_EPOCH_BOUND ? epoch : epoch * 1000;
  return Option.match(DateTime.make(millis), {
    onNone: () => undefined,
    onSome: (dateTime) => DateTime.formatIso(dateTime),
  });
};

export const formatWindowLabel = (windowMinutes: number | undefined, fallback: string): string => {
  if (windowMinutes === undefined || windowMinutes <= 0) return fallback;
  if (windowMinutes === MINUTES_PER_WEEK) return "week";
  if (windowMinutes < MINUTES_PER_HOUR) return `${Math.round(windowMinutes)}m`;
  if (windowMinutes < MINUTES_PER_DAY) {
    const hours = windowMinutes / MINUTES_PER_HOUR;
    return `${Number.isInteger(hours) ? hours : hours.toFixed(1)}h`;
  }
  const days = windowMinutes / MINUTES_PER_DAY;
  return `${Number.isInteger(days) ? days : days.toFixed(1)}d`;
};

const makeWindow = (input: {
  readonly key: string;
  readonly label: string;
  readonly usedPercent: number | undefined;
  readonly resetsAt: string | undefined;
  readonly windowMinutes: number | undefined;
  readonly observedAt: string;
}): ProviderUsageWindow => ({
  key: input.key,
  label: input.label,
  ...(input.usedPercent === undefined ? {} : { usedPercent: clampPercent(input.usedPercent) }),
  ...(input.resetsAt ? { resetsAt: input.resetsAt } : {}),
  ...(input.windowMinutes !== undefined && input.windowMinutes >= 1
    ? { windowMinutes: Math.round(input.windowMinutes) }
    : {}),
  updatedAt: input.observedAt,
});

const CLAUDE_WINDOWS: Record<string, { readonly label: string; readonly minutes?: number }> = {
  five_hour: { label: "5h", minutes: 300 },
  seven_day: { label: "week", minutes: MINUTES_PER_WEEK },
  seven_day_opus: { label: "opus", minutes: MINUTES_PER_WEEK },
  seven_day_sonnet: { label: "sonnet", minutes: MINUTES_PER_WEEK },
  overage: { label: "extra" },
};

const normalizeClaude = (
  info: Record<string, unknown>,
  observedAt: string,
): ReadonlyArray<ProviderUsageWindow> => {
  const rateLimitType = readString(info.rateLimitType);
  if (rateLimitType === undefined) return [];

  // `utilization` only accompanies a threshold warning. A plain "allowed"
  // event still pins down which window is live and when it resets, which is
  // worth showing, so the window is emitted with no percentage rather than
  // dropped.
  const utilization = readNumber(info.utilization);
  const descriptor = CLAUDE_WINDOWS[rateLimitType];
  return [
    makeWindow({
      key: rateLimitType,
      label: descriptor?.label ?? rateLimitType.replaceAll("_", " "),
      // Claude reports a 0-1 fraction, unlike every other percentage on the wire.
      usedPercent: utilization === undefined ? undefined : utilization * 100,
      resetsAt: epochToIso(info.resetsAt),
      windowMinutes: descriptor?.minutes,
      observedAt,
    }),
  ];
};

/**
 * The windows Claude's `/usage` snapshot reports that the meter draws. Two
 * fields of that snapshot are left out on purpose: `seven_day_oauth_apps` is
 * usage spent by other OAuth apps rather than by this client, and `extra_usage`
 * counts dollar credits, which is not a percentage of a window.
 */
const CLAUDE_PLAN_USAGE_WINDOWS = [
  "five_hour",
  "seven_day",
  "seven_day_opus",
  "seven_day_sonnet",
] as const;

/**
 * Reads the `/usage` control snapshot, which names every window at once with
 * `utilization` already scaled 0-100 and reset times in ISO. This is the only
 * source of a live percentage: the `rate_limit_event` stream withholds
 * `utilization` until a warning threshold is crossed.
 */
const normalizeClaudePlanUsage = (
  rateLimits: Record<string, unknown>,
  observedAt: string,
): ReadonlyArray<ProviderUsageWindow> => {
  const windows: Array<ProviderUsageWindow> = [];
  for (const field of CLAUDE_PLAN_USAGE_WINDOWS) {
    const value = rateLimits[field];
    if (!isRecord(value)) continue;

    // Both members are nullable, and a window described by neither says
    // nothing the meter can draw.
    const usedPercent = readNumber(value.utilization);
    const resetsAt = readIsoDate(value.resets_at);
    if (usedPercent === undefined && resetsAt === undefined) continue;

    const descriptor = CLAUDE_WINDOWS[field];
    windows.push(
      makeWindow({
        key: field,
        label: descriptor?.label ?? field.replaceAll("_", " "),
        // Already a percentage here, unlike the 0-1 fraction on the event.
        usedPercent,
        resetsAt,
        windowMinutes: descriptor?.minutes,
        observedAt,
      }),
    );
  }
  return windows;
};

const normalizeCodexWindow = (
  value: unknown,
  fallbackKey: string,
  fallbackLabel: string,
  observedAt: string,
): ProviderUsageWindow | null => {
  if (!isRecord(value)) return null;
  const usedPercent = readNumber(value.usedPercent);
  if (usedPercent === undefined) return null;

  const windowMinutes = readNumber(value.windowDurationMins);
  return makeWindow({
    // Key by duration so a snapshot that reorders primary/secondary still
    // merges onto the same window instead of duplicating it.
    key: windowMinutes !== undefined && windowMinutes > 0 ? `window_${windowMinutes}` : fallbackKey,
    label: formatWindowLabel(windowMinutes, fallbackLabel),
    usedPercent,
    resetsAt: epochToIso(value.resetsAt),
    windowMinutes,
    observedAt,
  });
};

const normalizeCodex = (
  snapshot: Record<string, unknown>,
  observedAt: string,
): ReadonlyArray<ProviderUsageWindow> => {
  const windows: Array<ProviderUsageWindow> = [];
  const primary = normalizeCodexWindow(snapshot.primary, "primary", "session", observedAt);
  if (primary) windows.push(primary);
  const secondary = normalizeCodexWindow(snapshot.secondary, "secondary", "week", observedAt);
  if (secondary && secondary.key !== primary?.key) windows.push(secondary);
  return windows;
};

export interface NormalizedProviderUsage {
  readonly windows: ReadonlyArray<ProviderUsageWindow>;
  readonly planLabel: string | undefined;
}

const toNormalized = (
  windows: ReadonlyArray<ProviderUsageWindow>,
  planLabel: string | undefined,
): NormalizedProviderUsage | null => (windows.length === 0 ? null : { windows, planLabel });

/**
 * Reads the `rateLimits` payload of an `account.rate-limits.updated` event.
 * Returns `null` when the payload carries no usable window, so callers can
 * leave the previously observed usage untouched.
 */
export const normalizeProviderUsagePayload = (
  payload: unknown,
  observedAt: string,
): NormalizedProviderUsage | null => {
  if (!isRecord(payload)) return null;

  // Claude forwards the whole SDK message for a threshold event...
  if (isRecord(payload.rate_limit_info)) {
    return toNormalized(normalizeClaude(payload.rate_limit_info, observedAt), undefined);
  }

  // ...and the snapshot itself for a polled `/usage` reply.
  if (isRecord(payload.rate_limits)) {
    return toNormalized(
      normalizeClaudePlanUsage(payload.rate_limits, observedAt),
      readString(payload.subscription_type),
    );
  }

  // Codex nests its snapshot one level deeper than the adapter's own
  // `rateLimits` wrapper.
  const codexSnapshot = isRecord(payload.rateLimits) ? payload.rateLimits : payload;
  return toNormalized(
    normalizeCodex(codexSnapshot, observedAt),
    readString(codexSnapshot.planType),
  );
};

/**
 * How far apart two reports of one window's reset time may sit and still count
 * as the same window. Claude's two sources date the same boundary differently:
 * `/usage` carries a sub-second component that drifts by milliseconds between
 * polls, while `rate_limit_event` reports whole epoch seconds. Matching those
 * as strings reads one window as two. Any real rollover moves the boundary by
 * the length of the window, which is hours.
 */
const RESET_DRIFT_TOLERANCE_MS = 60_000;

const isSameResetBoundary = (left: string | undefined, right: string | undefined): boolean => {
  if (left === right) return true;
  if (left === undefined || right === undefined) return false;
  const leftEpoch = Date.parse(left);
  const rightEpoch = Date.parse(right);
  if (Number.isNaN(leftEpoch) || Number.isNaN(rightEpoch)) return false;
  return Math.abs(leftEpoch - rightEpoch) <= RESET_DRIFT_TOLERANCE_MS;
};

/**
 * A percentage the provider stopped repeating is still true for as long as the
 * window is, so it carries forward. A moved reset time means a new window
 * began and the old percentage no longer describes it.
 */
const carryPercentForward = (
  previous: ProviderUsageWindow | undefined,
  incoming: ProviderUsageWindow,
): ProviderUsageWindow => {
  if (incoming.usedPercent !== undefined) return incoming;
  if (previous?.usedPercent === undefined) return incoming;
  if (!isSameResetBoundary(previous.resetsAt, incoming.resetsAt)) return incoming;
  return { ...incoming, usedPercent: previous.usedPercent };
};

/**
 * Merges freshly observed windows onto the previously known set, keyed by
 * window id. Claude only ever reports the window it just crossed, so dropping
 * the unmentioned windows would blank half the meter on every event.
 */
export const mergeUsageWindows = (
  previous: ReadonlyArray<ProviderUsageWindow>,
  incoming: ReadonlyArray<ProviderUsageWindow>,
): ReadonlyArray<ProviderUsageWindow> => {
  const merged = new Map(previous.map((window) => [window.key, window]));
  for (const window of incoming) {
    merged.set(window.key, carryPercentForward(merged.get(window.key), window));
  }
  return [...merged.values()].sort(
    (left, right) => (left.windowMinutes ?? 0) - (right.windowMinutes ?? 0),
  );
};
