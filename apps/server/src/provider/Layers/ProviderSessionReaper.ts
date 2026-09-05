import * as Clock from "effect/Clock";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schedule from "effect/Schedule";

import { ProjectionSnapshotQuery } from "../../orchestration/Services/ProjectionSnapshotQuery.ts";
import { ProviderSessionDirectory } from "../Services/ProviderSessionDirectory.ts";
import {
  ProviderSessionReaper,
  type ProviderSessionReaperShape,
} from "../Services/ProviderSessionReaper.ts";
import { forkParked } from "../../serverActivation.ts";
import { ProviderService } from "../Services/ProviderService.ts";

const DEFAULT_INACTIVITY_THRESHOLD_MS = 30 * 60 * 1000;
const DEFAULT_SWEEP_INTERVAL_MS = 5 * 60 * 1000;

export interface ProviderSessionReaperLiveOptions {
  readonly inactivityThresholdMs?: number;
  readonly sweepIntervalMs?: number;
}

const makeProviderSessionReaper = (options?: ProviderSessionReaperLiveOptions) =>
  Effect.gen(function* () {
    const providerService = yield* ProviderService;
    const directory = yield* ProviderSessionDirectory;
    const projectionSnapshotQuery = yield* ProjectionSnapshotQuery;

    const inactivityThresholdMs = Math.max(
      1,
      options?.inactivityThresholdMs ?? DEFAULT_INACTIVITY_THRESHOLD_MS,
    );
    const sweepIntervalMs = Math.max(1, options?.sweepIntervalMs ?? DEFAULT_SWEEP_INTERVAL_MS);

    const sweep = Effect.gen(function* () {
      const bindings = yield* directory.listBindings();
      const now = yield* Clock.currentTimeMillis;
      let reapedCount = 0;
      let stopFailedCount = 0;
      let skippedStopped = 0;
      let skippedInvalidLastSeen = 0;
      let skippedBelowThreshold = 0;
      let skippedActiveTurn = 0;
      let skippedBackgroundWork = 0;

      for (const binding of bindings) {
        // A stopped binding has no adapter-held session, so `stopSession`
        // could not reach a process even if we tried. Counted, not silent:
        // a large number here next to live provider processes is the
        // signature of sessions orphaned by an unclean server exit.
        if (binding.status === "stopped") {
          skippedStopped += 1;
          continue;
        }

        const lastSeenMs = Date.parse(binding.lastSeenAt);
        if (Number.isNaN(lastSeenMs)) {
          yield* Effect.logWarning("provider.session.reaper.invalid-last-seen", {
            threadId: binding.threadId,
            provider: binding.provider,
            lastSeenAt: binding.lastSeenAt,
          });
          skippedInvalidLastSeen += 1;
          continue;
        }

        const idleDurationMs = now - lastSeenMs;
        if (idleDurationMs < inactivityThresholdMs) {
          skippedBelowThreshold += 1;
          continue;
        }

        const thread = yield* projectionSnapshotQuery
          .getThreadShellById(binding.threadId)
          .pipe(Effect.map(Option.getOrUndefined));
        if (thread?.session?.activeTurnId != null) {
          yield* Effect.logDebug("provider.session.reaper.skipped-active-turn", {
            threadId: binding.threadId,
            activeTurnId: thread.session.activeTurnId,
            idleDurationMs,
          });
          skippedActiveTurn += 1;
          continue;
        }

        // The turn can settle while background work runs on (subagent
        // fleets, workflow runs, Monitor watch loops). Those live inside the
        // provider process, so stopping the session would kill them silently,
        // and nothing bumps lastSeenAt between turns.
        if (thread?.backgroundLiveness != null) {
          yield* Effect.logDebug("provider.session.reaper.skipped-background-work", {
            threadId: binding.threadId,
            backgroundLiveness: thread.backgroundLiveness,
            idleDurationMs,
          });
          skippedBackgroundWork += 1;
          continue;
        }

        const reaped = yield* providerService.stopSession({ threadId: binding.threadId }).pipe(
          Effect.tap(() =>
            Effect.logInfo("provider.session.reaped", {
              threadId: binding.threadId,
              provider: binding.provider,
              idleDurationMs,
              reason: "inactivity_threshold",
            }),
          ),
          Effect.as(true),
          Effect.catchCause((cause) =>
            Effect.logWarning("provider.session.reaper.stop-failed", {
              threadId: binding.threadId,
              provider: binding.provider,
              idleDurationMs,
              cause,
            }).pipe(Effect.as(false)),
          ),
        );

        if (reaped) {
          reapedCount += 1;
        } else {
          stopFailedCount += 1;
        }
      }

      // Logged every sweep, including empty ones: "the sweep ran and found
      // nothing" and "the sweep never ran" must not look the same.
      yield* Effect.logInfo("provider.session.reaper.sweep-complete", {
        totalBindings: bindings.length,
        reapedCount,
        stopFailedCount,
        skippedStopped,
        skippedInvalidLastSeen,
        skippedBelowThreshold,
        skippedActiveTurn,
        skippedBackgroundWork,
      });
    });

    const start: ProviderSessionReaperShape["start"] = () =>
      Effect.gen(function* () {
        yield* forkParked(
          sweep.pipe(
            Effect.catch((error: unknown) =>
              Effect.logWarning("provider.session.reaper.sweep-failed", {
                error,
              }),
            ),
            Effect.catchDefect((defect: unknown) =>
              Effect.logWarning("provider.session.reaper.sweep-defect", {
                defect,
              }),
            ),
            Effect.repeat(Schedule.spaced(Duration.millis(sweepIntervalMs))),
          ),
        );

        // `forkParked` resolves its parked latch before activation runs, so
        // this proves the fiber exists, not that a sweep has executed. The
        // per-sweep `sweep-complete` line is the proof that it is running.
        yield* Effect.logInfo("provider.session.reaper.started", {
          phase: "forked",
          inactivityThresholdMs,
          sweepIntervalMs,
        });
      });

    return {
      start,
    } satisfies ProviderSessionReaperShape;
  });

export const makeProviderSessionReaperLive = (options?: ProviderSessionReaperLiveOptions) =>
  Layer.effect(ProviderSessionReaper, makeProviderSessionReaper(options));

export const ProviderSessionReaperLive = makeProviderSessionReaperLive();
