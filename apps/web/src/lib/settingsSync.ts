/**
 * Shared decision logic for the client stores that mirror themselves into
 * server-owned client settings.
 *
 * These stores (open chat tabs, workspace labelling, unsent prompts) were
 * browser-local, which meant a second device — a phone on the tailnet, the
 * same server reached by another hostname — started empty and stayed empty.
 * The server is the one thing every device shares, so it holds the value and
 * each device converges on it.
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
  /** Nothing to do: the two sides already agree, or settings have not landed. */
  | "idle"
  /** Publish what this device already had. Only ever the first exchange. */
  | "adopt-local"
  /** Take the remote value, including removals. */
  | "apply-remote";

/**
 * Which way the next exchange should move.
 *
 * `agreedSerialized` is the last value both sides were known to hold. A remote
 * value that still matches it carries no news — that is what stops an echo of
 * this device's own write from being re-applied — and a local value that
 * differs from it is an unpublished local edit.
 *
 * The one asymmetry is the first exchange: a server that has never stored this
 * value must not be read as "everything was closed elsewhere" and wipe the
 * tabs, names and drafts this browser has been holding on its own. It adopts
 * them instead. After that the remote value wins in both directions, so
 * closing the last tab on one device closes it on the others.
 */
export function resolveSettingsSyncAction(input: {
  readonly hydrated: boolean;
  readonly remoteSerialized: string;
  readonly localSerialized: string;
  readonly agreedSerialized: string | null;
  readonly remoteIsEmpty: boolean;
  readonly localIsEmpty: boolean;
}): SettingsSyncAction {
  if (!input.hydrated) return "idle";
  if (input.remoteSerialized === input.agreedSerialized) return "idle";
  if (input.agreedSerialized === null && input.remoteIsEmpty && !input.localIsEmpty) {
    return "adopt-local";
  }
  if (input.remoteSerialized === input.localSerialized) return "idle";
  return "apply-remote";
}
