/**
 * Shared decision logic for the client stores that mirror themselves into
 * server-owned client settings.
 *
 * These stores (open chat tabs, workspace labelling) were browser-local, which
 * meant a second device — a phone on the tailnet, the same server reached by
 * another hostname — started empty and stayed empty. The server is the one
 * thing every device shares, so it holds the value and each device converges
 * on it.
 *
 * Convergence is decided by a counter, never by content. Content cannot decide
 * it: an empty set is both "I just closed everything" and "I have not synced
 * yet", and reading it the second way is what makes closed tabs come back.
 * Every local change claims `max(versions seen) + 1`, so the later edit always
 * wins and no device has to trust another's clock.
 */

/** Key order in a `Record` is incidental, so compare a sorted rendering. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonical);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, entry]) => [key, canonical(entry)] as const),
    );
  }
  return value;
}

export function serializeSyncedValue(value: unknown): string {
  return JSON.stringify(canonical(value)) ?? "null";
}

export type SettingsSyncAction =
  /** The two sides agree, or settings have not landed yet. */
  | "idle"
  /** This device holds the later edit; publish it. */
  | "publish-local"
  /** The server holds the later edit; take it, removals included. */
  | "apply-remote";

/**
 * Which way the next exchange should move.
 *
 * Equal versions with different content is the first exchange: a browser
 * carrying tabs from before syncing existed (version 0) against a server that
 * has never stored any (also version 0). The non-empty side wins there, which
 * is what lifts an existing strip onto the server instead of wiping it. Every
 * exchange after that is ordered by the counter alone.
 */
export function resolveSettingsSyncAction(input: {
  readonly hydrated: boolean;
  readonly remoteVersion: number;
  readonly localVersion: number;
  readonly sameContent: boolean;
  readonly localIsEmpty: boolean;
}): SettingsSyncAction {
  if (!input.hydrated) return "idle";
  if (input.sameContent) return "idle";
  if (input.remoteVersion > input.localVersion) return "apply-remote";
  if (input.localVersion > input.remoteVersion) return "publish-local";
  return input.localIsEmpty ? "apply-remote" : "publish-local";
}

/** The version a local change claims: past everything either side has seen. */
export function nextSyncVersion(input: {
  readonly localVersion: number;
  readonly remoteVersion: number;
}): number {
  return Math.max(input.localVersion, input.remoteVersion) + 1;
}
