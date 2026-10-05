import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";

interface TrackedTurn {
  readonly runId: string;
  readonly status: NonNullable<EnvironmentThreadShell["latestRun"]>["status"];
}

export interface AgentCompletionTrackerState {
  readonly initialized: boolean;
  readonly turnsByThread: ReadonlyMap<string, TrackedTurn | null>;
}

export function createAgentCompletionTrackerState(): AgentCompletionTrackerState {
  return {
    initialized: false,
    turnsByThread: new Map(),
  };
}

export function detectAgentCompletions(input: {
  readonly state: AgentCompletionTrackerState;
  readonly threads: ReadonlyArray<EnvironmentThreadShell>;
  readonly bootstrapped: boolean;
}): {
  readonly state: AgentCompletionTrackerState;
  readonly completions: ReadonlyArray<EnvironmentThreadShell>;
} {
  if (!input.bootstrapped) {
    return { state: input.state, completions: [] };
  }

  const turnsByThread = new Map<string, TrackedTurn | null>();
  const completions: EnvironmentThreadShell[] = [];

  for (const thread of input.threads) {
    const key = scopedThreadKey({
      environmentId: thread.environmentId,
      threadId: thread.id,
    });
    const latestRun = thread.latestRun;
    const nextTurn: TrackedTurn | null = latestRun
      ? { runId: latestRun.runId, status: latestRun.status }
      : null;
    turnsByThread.set(key, nextTurn);

    if (!input.state.initialized || nextTurn?.status !== "completed") {
      continue;
    }

    const previousTurn = input.state.turnsByThread.get(key);
    if (
      previousTurn !== undefined &&
      (previousTurn === null ||
        previousTurn.runId !== nextTurn.runId ||
        previousTurn.status !== "completed")
    ) {
      completions.push(thread);
    }
  }

  return {
    state: {
      initialized: true,
      turnsByThread,
    },
    completions,
  };
}
