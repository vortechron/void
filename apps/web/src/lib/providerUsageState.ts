import type { ProviderUsageState } from "@t3tools/contracts";
import { useEffect, useRef } from "react";

import { usePrimaryEnvironment } from "../state/environments";
import { useEnvironmentQuery } from "../state/query";
import { serverEnvironment } from "../state/server";

export interface ProviderUsageQueryState {
  readonly data: ProviderUsageState | null;
  readonly error: string | null;
  readonly isPending: boolean;
  readonly refresh: () => void;
}

/** Subscription usage the providers reported for the primary environment. */
export function useProviderUsage(): ProviderUsageQueryState {
  const primaryEnvironment = usePrimaryEnvironment();
  const environmentId = primaryEnvironment?.environmentId ?? null;

  const query = useEnvironmentQuery(
    environmentId === null ? null : serverEnvironment.providerUsage({ environmentId, input: {} }),
  );

  // Re-establishing the subscription (a manual "check now", or the periodic
  // re-sync below) tears the stream down before the server replays the latest
  // snapshot. Holding the last reading across that gap keeps the meter from
  // blinking out and back every time it refreshes. Scoped to the environment
  // so a server switch cannot show the previous server's numbers.
  const retained = useRef<{ environmentId: string | null; data: ProviderUsageState | null }>({
    environmentId,
    data: null,
  });
  if (retained.current.environmentId !== environmentId) {
    retained.current = { environmentId, data: null };
  }
  if (query.data !== null) {
    retained.current = { environmentId, data: query.data };
  }

  return { ...query, data: query.data ?? retained.current.data };
}

/**
 * Periodically re-pulls the usage snapshot.
 *
 * The server pushes changes as providers report them, so this is a safety net
 * for a stream that has gone quiet rather than the primary path — which is why
 * it is measured in minutes and can be turned off entirely (`0`).
 */
export function useProviderUsageAutoRefresh(
  refresh: () => void,
  intervalSeconds: number,
  enabled = true,
): void {
  // Read through a ref so a new `refresh` identity each render cannot restart
  // the timer and postpone the next tick forever.
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    if (!enabled || intervalSeconds <= 0) return;
    const id = window.setInterval(() => refreshRef.current(), intervalSeconds * 1000);
    return () => window.clearInterval(id);
  }, [enabled, intervalSeconds]);
}
