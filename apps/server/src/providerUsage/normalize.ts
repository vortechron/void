/**
 * Projects a provider's published usage limits onto the compact shape the
 * sidebar meter renders.
 *
 * `ServerProvider.usageLimits` is the single source of truth for subscription
 * usage: the status probe writes the full window set into it, and
 * `ProviderUsageLimitsIngestion` folds turn-driven `account.rate-limits.updated`
 * events onto the same rows. Each provider's own mapper (`codexUsageLimits`,
 * `claudeUsageLimits`) already reconciles those two sources onto one window id,
 * which leaves this module with display concerns only.
 */
import type { ProviderUsageWindow, ServerProviderUsageWindow } from "@t3tools/contracts";

const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = MINUTES_PER_HOUR * 24;
const MINUTES_PER_WEEK = MINUTES_PER_DAY * 7;

/**
 * A meter column is about sixty pixels wide, so a window is named by how long
 * it runs rather than by the Limits view's long-form label.
 */
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

/**
 * A model-scoped window is labelled `Weekly · Fable`. Its duration matches the
 * plain weekly row, so the model name is the only part that tells the two
 * apart and the only part worth the column's width.
 */
const scopedLabel = (label: string): string | undefined => {
  const separator = label.lastIndexOf("·");
  if (separator === -1) return undefined;
  const scoped = label.slice(separator + 1).trim();
  return scoped.length > 0 ? scoped : undefined;
};

/**
 * `checkedAt` becomes the window's `updatedAt`, so the meter's "synced" label
 * reports when the provider was actually read rather than when this server
 * happened to notice.
 */
export const toMeterWindow = (
  window: ServerProviderUsageWindow,
  checkedAt: string,
): ProviderUsageWindow => ({
  key: window.id,
  label: scopedLabel(window.label) ?? formatWindowLabel(window.windowDurationMins, window.label),
  usedPercent: Math.min(100, Math.max(0, window.usedPercent)),
  ...(window.resetsAt ? { resetsAt: window.resetsAt } : {}),
  ...(window.windowDurationMins !== undefined && window.windowDurationMins >= 1
    ? { windowMinutes: window.windowDurationMins }
    : {}),
  updatedAt: checkedAt,
});
