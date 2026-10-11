/**
 * ProviderUsage - subscription usage as the meter renders it.
 *
 * Every provider publishes what it knows about the signed-in account on
 * `ServerProvider.usageLimits`: the status probe writes the full window set
 * there, and `ProviderUsageLimitsIngestion` folds turn-driven rate-limit
 * events onto the same rows. This service watches the provider registry, keeps
 * the projection the sidebar meter needs, and republishes it to clients.
 *
 * Reading the registry rather than the raw event stream is what keeps the
 * meter honest about usage spent outside T3 Code: the five-minute status probe
 * asks the provider itself, so a week spent in the ChatGPT app shows up here
 * without the user having to run a turn first.
 *
 * The state is cached on disk so the meter is populated on the next boot
 * instead of blank until the first probe answers.
 *
 * @module ProviderUsage
 */
import {
  EMPTY_PROVIDER_USAGE_STATE,
  type ProviderInstanceId,
  type ProviderDriverKind,
  ProviderUsageState,
  type ProviderUsageSnapshot,
  type ServerProvider,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
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

import { writeFileStringAtomically } from "@t3tools/shared/atomicWrite";
import * as ServerConfig from "../config.ts";
import { ProviderRegistry } from "../provider/ProviderRegistry.ts";
import { forkParked } from "../serverActivation.ts";
import { subscribeBeforeSnapshot } from "../utils/subscribeBeforeSnapshot.ts";
import { toMeterWindow } from "./normalize.ts";

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
    /** Exposed for tests and for callers that observe the registry out of band. */
    readonly recordProviders: (providers: ReadonlyArray<ServerProvider>) => Effect.Effect<void>;
  }
>()("t3/providerUsage/ProviderUsage") {}

const decodeCachedState = Schema.decodeUnknownEffect(Schema.fromJsonString(ProviderUsageState));
const encodeCachedState = Schema.encodeUnknownEffect(Schema.fromJsonString(ProviderUsageState));

const snapshotKey = (
  provider: ProviderDriverKind,
  providerInstanceId: ProviderInstanceId | undefined,
): string => (providerInstanceId ? `${provider}:${providerInstanceId}` : provider);

const snapshotsEqual = (left: ProviderUsageSnapshot, right: ProviderUsageSnapshot): boolean => {
  if (left.updatedAt !== right.updatedAt || left.windows.length !== right.windows.length) {
    return false;
  }
  return left.windows.every((window, index) => {
    const other = right.windows[index];
    return (
      other !== undefined &&
      window.key === other.key &&
      window.label === other.label &&
      window.usedPercent === other.usedPercent &&
      window.resetsAt === other.resetsAt &&
      window.windowMinutes === other.windowMinutes
    );
  });
};

/**
 * Folds the providers' published limits into the meter state, returning
 * `state` untouched when nothing moved.
 *
 * A provider that reported nothing this round keeps what it last reported:
 * `usageLimits` is absent until the first probe answers, and a probe that
 * failed publishes `probeFailed` rather than an empty window set. Only
 * `unsupported` — an account that can never have windows, such as an API key —
 * clears a column. Anything else replaces that provider's windows outright,
 * which is what retires a window the provider has stopped reporting.
 */
export const applyProviderSnapshots = (
  state: ProviderUsageState,
  providers: ReadonlyArray<ServerProvider>,
): ProviderUsageState => {
  const byKey = new Map(
    state.providers.map(
      (snapshot) =>
        [snapshotKey(snapshot.provider, snapshot.providerInstanceId), snapshot] as const,
    ),
  );
  let changed = false;

  for (const provider of providers) {
    const limits = provider.usageLimits;
    if (!limits || limits.unavailable?.reason === "probeFailed") continue;

    const key = snapshotKey(provider.driver, provider.instanceId);
    if (limits.unavailable?.reason === "unsupported") {
      changed = byKey.delete(key) || changed;
      continue;
    }

    const next: ProviderUsageSnapshot = {
      provider: provider.driver,
      providerInstanceId: provider.instanceId,
      windows: limits.windows.map((window) => toMeterWindow(window, limits.checkedAt)),
      updatedAt: limits.checkedAt,
    };
    const previous = byKey.get(key);
    if (previous && snapshotsEqual(previous, next)) continue;
    byKey.set(key, next);
    changed = true;
  }

  return changed ? { providers: [...byKey.values()] } : state;
};

const make = Effect.fn("ProviderUsage.make")(function* () {
  const config = yield* ServerConfig.ServerConfig;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const providerRegistry = yield* ProviderRegistry;

  const cachePath = path.join(config.stateDir, PROVIDER_USAGE_CACHE_FILENAME);
  // `recordProviders` is exposed on a service whose signature carries no
  // context, so the platform services the cache write needs are captured here.
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

  const recordProviders = (providers: ReadonlyArray<ServerProvider>) =>
    publishMutex.withPermits(1)(
      Effect.gen(function* () {
        const current = yield* Ref.get(stateRef);
        const next = applyProviderSnapshots(current, providers);
        // The registry republishes on every snapshot change — a version
        // advisory, a model list, an update run — and only a few of those
        // carry new usage. Nothing goes over the wire for the rest.
        if (next === current) return;

        yield* Ref.set(stateRef, next);
        yield* PubSub.publish(changes, next);
        yield* persist(next);
      }),
    );

  yield* forkParked(
    Stream.runForEach(
      // The registry streams changes only, so the snapshots that were already
      // current when this fork started have to be read in as well.
      Stream.concat(
        Stream.fromEffect(providerRegistry.getProviders),
        providerRegistry.streamChanges,
      ),
      recordProviders,
    ),
  );

  return ProviderUsage.of({
    snapshot,
    subscribe: subscribeBeforeSnapshot(changes, snapshot, publishMutex),
    recordProviders,
  });
});

export const layer = Layer.effect(ProviderUsage, make());
