import * as Schema from "effect/Schema";

import { IsoDateTime, PositiveInt, TrimmedNonEmptyString } from "./baseSchemas.ts";
import { ProviderDriverKind, ProviderInstanceId } from "./providerInstance.ts";

/**
 * Subscription usage as the sidebar meter renders it: a projection of the
 * windows a provider publishes on `ServerProvider.usageLimits`, shortened to
 * fit the meter's columns. `ProviderUsage` on the server owns the projection.
 */
export const ProviderUsageWindow = Schema.Struct({
  // Provider-native window identifier, e.g. "five_hour" or "primary".
  key: TrimmedNonEmptyString,
  // Short display label, e.g. "5h" or "week".
  label: TrimmedNonEmptyString,
  // Optional so a cached snapshot written before a provider reported a number
  // still decodes; every live projection carries one.
  usedPercent: Schema.optional(Schema.Number.check(Schema.isBetween({ minimum: 0, maximum: 100 }))),
  resetsAt: Schema.optional(IsoDateTime),
  windowMinutes: Schema.optional(PositiveInt),
  updatedAt: IsoDateTime,
});
export type ProviderUsageWindow = typeof ProviderUsageWindow.Type;

export const ProviderUsageSnapshot = Schema.Struct({
  provider: ProviderDriverKind,
  providerInstanceId: Schema.optional(ProviderInstanceId),
  windows: Schema.Array(ProviderUsageWindow),
  updatedAt: IsoDateTime,
});
export type ProviderUsageSnapshot = typeof ProviderUsageSnapshot.Type;

export const ProviderUsageState = Schema.Struct({
  providers: Schema.Array(ProviderUsageSnapshot),
});
export type ProviderUsageState = typeof ProviderUsageState.Type;

export const EMPTY_PROVIDER_USAGE_STATE: ProviderUsageState = { providers: [] };
