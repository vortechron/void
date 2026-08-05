import * as Schema from "effect/Schema";

import { IsoDateTime, PositiveInt, TrimmedNonEmptyString } from "./baseSchemas.ts";
import { ProviderDriverKind, ProviderInstanceId } from "./providerInstance.ts";

/**
 * Subscription usage as reported by a provider itself. Providers publish this
 * as rolling updates while a session runs (Claude sends one window per event,
 * Codex sends a primary/secondary pair), so the server merges windows by key
 * instead of replacing the whole set on every update.
 */
export const ProviderUsageWindow = Schema.Struct({
  // Provider-native window identifier, e.g. "five_hour" or "seven_day".
  key: TrimmedNonEmptyString,
  // Short display label, e.g. "5h" or "week".
  label: TrimmedNonEmptyString,
  usedPercent: Schema.Number.check(Schema.isBetween({ minimum: 0, maximum: 100 })),
  resetsAt: Schema.optional(IsoDateTime),
  windowMinutes: Schema.optional(PositiveInt),
  updatedAt: IsoDateTime,
});
export type ProviderUsageWindow = typeof ProviderUsageWindow.Type;

export const ProviderUsageSnapshot = Schema.Struct({
  provider: ProviderDriverKind,
  providerInstanceId: Schema.optional(ProviderInstanceId),
  planLabel: Schema.optional(TrimmedNonEmptyString),
  windows: Schema.Array(ProviderUsageWindow),
  updatedAt: IsoDateTime,
});
export type ProviderUsageSnapshot = typeof ProviderUsageSnapshot.Type;

export const ProviderUsageState = Schema.Struct({
  providers: Schema.Array(ProviderUsageSnapshot),
});
export type ProviderUsageState = typeof ProviderUsageState.Type;

export const EMPTY_PROVIDER_USAGE_STATE: ProviderUsageState = { providers: [] };
