/**
 * ProviderUsage - subscription usage reported by the providers themselves.
 *
 * Providers publish `account.rate-limits.updated` while a session runs. Nothing
 * else consumed those events, so this service taps the runtime event stream,
 * merges each report onto the last known windows per provider, and republishes
 * the merged state to clients.
 *
 * The state is cached on disk because a provider only reports usage during a
 * turn: without the cache the meter would sit blank after every restart until
 * the user happened to run an agent.
 *
 * @module ProviderUsage
 */
import {
  EMPTY_PROVIDER_USAGE_STATE,
  type ProviderInstanceId,
  type ProviderDriverKind,
  type ProviderRuntimeEvent,
  ProviderUsageState,
  type ProviderUsageSnapshot,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as PubSub from "effect/PubSub";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";
import * as Scope from "effect/Scope";
import * as Semaphore from "effect/Semaphore";
import * as Stream from "effect/Stream";

import { writeFileStringAtomically } from "../atomicWrite.ts";
import * as ServerConfig from "../config.ts";
import { ProviderService } from "../provider/Services/ProviderService.ts";
import { forkParked } from "../serverActivation.ts";
import { subscribeBeforeSnapshot } from "../utils/subscribeBeforeSnapshot.ts";
import { mergeUsageWindows, normalizeProviderUsagePayload } from "./normalize.ts";

export const PROVIDER_USAGE_CACHE_FILENAME = "provider-usage.json";

export class ProviderUsage extends Context.Service<
  ProviderUsage,
  {
    readonly snapshot: Effect.Effect<ProviderUsageState>;
    readonly subscribe: Effect.Effect<
      {
        readonly latest: ProviderUsageState;
        readonly changes: Stream.Stream<ProviderUsageState>;
      },
      never,
      Scope.Scope
    >;
    /** Exposed for tests and for adapters that observe usage out of band. */
    readonly recordEvent: (event: ProviderRuntimeEvent) => Effect.Effect<void>;
  }
>()("t3/providerUsage/ProviderUsage") {}

const decodeCachedState = Schema.decodeUnknownEffect(Schema.fromJsonString(ProviderUsageState));
const encodeCachedState = Schema.encodeUnknownEffect(Schema.fromJsonString(ProviderUsageState));

const snapshotKey = (
  provider: ProviderDriverKind,
  providerInstanceId: ProviderInstanceId | undefined,
): string => (providerInstanceId ? `${provider}:${providerInstanceId}` : provider);

export const applyUsageEvent = (
  state: ProviderUsageState,
  input: {
    readonly provider: ProviderDriverKind;
    readonly providerInstanceId: ProviderInstanceId | undefined;
    readonly payload: unknown;
    readonly observedAt: string;
  },
): ProviderUsageState | null => {
  const normalized = normalizeProviderUsagePayload(input.payload, input.observedAt);
  if (!normalized) return null;

  const key = snapshotKey(input.provider, input.providerInstanceId);
  const previous = state.providers.find(
    (candidate) => snapshotKey(candidate.provider, candidate.providerInstanceId) === key,
  );
  const planLabel = normalized.planLabel ?? previous?.planLabel;
  const next: ProviderUsageSnapshot = {
    provider: input.provider,
    ...(input.providerInstanceId ? { providerInstanceId: input.providerInstanceId } : {}),
    ...(planLabel ? { planLabel } : {}),
    windows: mergeUsageWindows(previous?.windows ?? [], normalized.windows),
    updatedAt: input.observedAt,
  };

  const providers = previous
    ? state.providers.map((candidate) =>
        snapshotKey(candidate.provider, candidate.providerInstanceId) === key ? next : candidate,
      )
    : [...state.providers, next];

  return { providers };
};

const make = Effect.fn("ProviderUsage.make")(function* () {
  const config = yield* ServerConfig.ServerConfig;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const providerService = yield* ProviderService;

  const cachePath = path.join(config.stateDir, PROVIDER_USAGE_CACHE_FILENAME);
  // `recordEvent` is exposed on a service whose signature carries no context,
  // so the platform services the cache write needs are captured here.
  const platform = yield* Effect.context<FileSystem.FileSystem | Path.Path>();

  const restored = yield* fs.readFileString(cachePath).pipe(
    Effect.flatMap(decodeCachedState),
    // A missing or stale-shaped cache is expected, not a failure: usage
    // refills from the next provider report either way.
    Effect.catchCause(() => Effect.succeed(EMPTY_PROVIDER_USAGE_STATE)),
  );

  const stateRef = yield* Ref.make<ProviderUsageState>(restored);
  const changes = yield* PubSub.unbounded<ProviderUsageState>();
  const publishMutex = yield* Semaphore.make(1);

  const snapshot = Ref.get(stateRef);

  const persist = (state: ProviderUsageState) =>
    encodeCachedState(state).pipe(
      Effect.flatMap((contents) =>
        writeFileStringAtomically({ filePath: cachePath, contents: `${contents}\n` }),
      ),
      Effect.catchCause((cause) =>
        Effect.logWarning("provider usage cache write failed", { cachePath, cause }),
      ),
      Effect.provide(platform),
    );

  const recordEvent = (event: ProviderRuntimeEvent) =>
    publishMutex.withPermits(1)(
      Effect.gen(function* () {
        if (event.type !== "account.rate-limits.updated") return;

        const observedAt = event.createdAt || DateTime.formatIso(yield* DateTime.now);
        const current = yield* Ref.get(stateRef);
        const next = applyUsageEvent(current, {
          provider: event.provider,
          providerInstanceId: event.providerInstanceId,
          payload: event.payload.rateLimits,
          observedAt,
        });
        if (!next) return;

        yield* Ref.set(stateRef, next);
        yield* PubSub.publish(changes, next);
        yield* persist(next);
      }),
    );

  yield* forkParked(Stream.runForEach(providerService.streamEvents, recordEvent));

  return ProviderUsage.of({
    snapshot,
    subscribe: subscribeBeforeSnapshot(changes, snapshot, publishMutex),
    recordEvent,
  });
});

export const layer = Layer.effect(ProviderUsage, make());
