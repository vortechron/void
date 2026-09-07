/**
 * ThreadBackgroundLivenessService - in-memory per-thread background liveness
 * for the sidebar status pill.
 *
 * The turn can settle while native background work runs on (subagent fleets,
 * workflow runs, Monitor watch loops); the shell previously showed nothing.
 * Ingestion records task lifecycle transitions and the shell query reads the
 * derived state at mapping time — no persistence, no migration. After a
 * server restart the registry is empty until new task events arrive, which
 * matches reality: orphaned background work is not live.
 *
 * "monitoring" is reserved for watch loops (monitor tasks and background
 * shells) when they are the ONLY live work; any agent work presents as
 * "working".
 *
 * Entries expire. Background work that stops emitting for `staleAfterMs`
 * stops counting as live, so a subagent lost without a terminal status can
 * neither pin the sidebar pill nor block `ProviderSessionReaper` forever.
 *
 * @module ThreadBackgroundLivenessService
 */
import { INERT_TASK_TYPES, MONITOR_TASK_TYPES } from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

export type ThreadBackgroundLiveness = "working" | "monitoring" | null;

interface ThreadLivenessState {
  /** taskId -> last time a non-terminal transition was seen, in ms. */
  readonly agents: Map<string, number>;
  readonly monitors: Map<string, number>;
}

export interface ThreadBackgroundLivenessOptions {
  /**
   * A task that emits nothing for this long is treated as a ghost and stops
   * counting as live. Without it a subagent that dies without a terminal
   * status pins its thread as "working" for the life of the server, which
   * also makes `ProviderSessionReaper` skip that thread forever.
   */
  readonly staleAfterMs?: number;
  readonly now?: () => number;
}

// Four hours is well past any legitimate quiet gap (a Monitor watch loop
// wakes at most an hour apart) while still bounding a ghost's lifetime.
const DEFAULT_STALE_AFTER_MS = 4 * 60 * 60 * 1000;

// Classification sets are the shared contracts copies (MONITOR_TASK_TYPES:
// watch loops — monitor tasks plus background shells, which in practice are
// PR babysitting/log tails since pacing sleeps complete inside the turn;
// INERT_TASK_TYPES: plan-mode bookkeeping) so this registry, ingestion's
// agentKind stamp, and the client fold can never drift apart.

const TERMINAL_STATUSES: ReadonlySet<string> = new Set([
  "completed",
  "failed",
  "stopped",
  "cancelled",
  "interrupted",
]);

export class ThreadBackgroundLivenessService extends Context.Service<
  ThreadBackgroundLivenessService,
  {
    /**
     * Feed one task lifecycle transition. taskType may be absent on
     * synthesized rows (workflow members, Codex children) — those count as
     * agents. agentId marks a task launched from inside a subagent: its
     * internal shells are covered by the owning agent's liveness, but a
     * NESTED AGENT (agentId + agent-flavored taskType) still counts — it
     * can outlive its parent and must keep the thread Working.
     */
    readonly recordTaskLiveness: (input: {
      readonly threadId: string;
      readonly taskId: string;
      readonly taskType: string | undefined;
      readonly status: string | undefined;
      readonly kind: "started" | "progress" | "updated" | "completed";
      readonly agentId?: string | undefined;
    }) => void;

    /** Session death orphans all of a thread's background work. */
    readonly clearThreadLiveness: (threadId: string) => void;

    /**
     * Two-state vocabulary by design: any live agent work is "working";
     * "monitoring" only when watch loops are the ONLY live work.
     */
    readonly getThreadBackgroundLiveness: (threadId: string) => ThreadBackgroundLiveness;
  }
>()("t3/orchestration/ThreadBackgroundLiveness/ThreadBackgroundLivenessService") {}

export function make(
  options?: ThreadBackgroundLivenessOptions,
): ThreadBackgroundLivenessService["Service"] {
  const stateByThreadId = new Map<string, ThreadLivenessState>();
  const staleAfterMs = Math.max(1, options?.staleAfterMs ?? DEFAULT_STALE_AFTER_MS);
  // A plain factory, not an Effect, so there is no Clock to read here.
  // Tests inject their own time source through `options.now`.
  // @effect-diagnostics-next-line globalDate:off
  const now = options?.now ?? (() => Date.now());

  const stateFor = (threadId: string): ThreadLivenessState => {
    const existing = stateByThreadId.get(threadId);
    if (existing) {
      return existing;
    }
    const created: ThreadLivenessState = { agents: new Map(), monitors: new Map() };
    stateByThreadId.set(threadId, created);
    return created;
  };

  // Classification is per-transition, not sticky: a task first seen without
  // a taskType may later reveal itself as a shell, become inert, or turn out
  // to be agent-owned. Every path drops any prior entry for the taskId so a
  // stale bucket assignment can't pin the thread's status (review finding).
  const drop = (threadId: string, taskId: string) => {
    const state = stateByThreadId.get(threadId);
    if (!state) {
      return;
    }
    state.agents.delete(taskId);
    state.monitors.delete(taskId);
    if (state.agents.size === 0 && state.monitors.size === 0) {
      stateByThreadId.delete(threadId);
    }
  };

  // Read-time sweep: entries are dropped, not just ignored, so a thread that
  // only ever holds ghosts cannot grow without bound. A task that keeps
  // emitting anything refreshes its stamp and is never pruned.
  const pruneStale = (threadId: string, state: ThreadLivenessState) => {
    const cutoff = now() - staleAfterMs;
    for (const bucket of [state.agents, state.monitors]) {
      for (const [taskId, lastSeenMs] of bucket) {
        if (lastSeenMs <= cutoff) {
          bucket.delete(taskId);
        }
      }
    }
    if (state.agents.size === 0 && state.monitors.size === 0) {
      stateByThreadId.delete(threadId);
    }
  };

  return {
    recordTaskLiveness: (input) => {
      const taskType = input.taskType;
      if (taskType !== undefined && INERT_TASK_TYPES.has(taskType)) {
        drop(input.threadId, input.taskId);
        return;
      }
      // A subagent's internal non-agent work (its own shells/monitors) is
      // covered by the owning agent's liveness. Nested agents fall through:
      // they can outlive their parent (review finding).
      if (
        input.agentId !== undefined &&
        (taskType === undefined || MONITOR_TASK_TYPES.has(taskType))
      ) {
        drop(input.threadId, input.taskId);
        return;
      }

      // Idle counts as not-live: a resting (resumable) Codex child isn't
      // doing anything, and an all-idle fleet must not pin Working.
      const terminal =
        input.kind === "completed" ||
        input.status === "idle" ||
        (input.status !== undefined && TERMINAL_STATUSES.has(input.status));
      if (terminal) {
        drop(input.threadId, input.taskId);
        return;
      }

      // Status-free progress and metadata updates are not restarts. A delayed
      // row after idle must not put the task back in the live set (#7128).
      if ((input.kind === "progress" || input.kind === "updated") && input.status === undefined) {
        const existing = stateByThreadId.get(input.threadId);
        const stillLive =
          existing !== undefined &&
          (existing.agents.has(input.taskId) || existing.monitors.has(input.taskId));
        if (!stillLive) {
          return;
        }
      }

      drop(input.threadId, input.taskId);
      const state = stateFor(input.threadId);
      const bucket =
        taskType !== undefined && MONITOR_TASK_TYPES.has(taskType) ? state.monitors : state.agents;
      bucket.set(input.taskId, now());
    },

    clearThreadLiveness: (threadId) => {
      stateByThreadId.delete(threadId);
    },

    getThreadBackgroundLiveness: (threadId) => {
      const state = stateByThreadId.get(threadId);
      if (!state) {
        return null;
      }
      pruneStale(threadId, state);
      if (state.agents.size > 0) {
        return "working";
      }
      if (state.monitors.size > 0) {
        return "monitoring";
      }
      return null;
    },
  };
}

// Wrapped rather than passed by reference: `make` now takes options, and a
// bare reference would hand it whatever the thunk is called with.
export const layer = Layer.effect(
  ThreadBackgroundLivenessService,
  Effect.sync(() => make()),
);
