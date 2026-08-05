import type { ProviderUsageState } from "@t3tools/contracts";

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

  return useEnvironmentQuery(
    environmentId === null ? null : serverEnvironment.providerUsage({ environmentId, input: {} }),
  );
}
