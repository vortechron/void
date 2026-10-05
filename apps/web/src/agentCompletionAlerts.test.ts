import {
  presentThreadShell,
  type EnvironmentThreadShell,
} from "@t3tools/client-runtime/state/models";
import * as DateTime from "effect/DateTime";
import { describe, expect, it } from "vite-plus/test";

import { createAgentCompletionTrackerState, detectAgentCompletions } from "./agentCompletionAlerts";

const STARTED_AT = DateTime.makeUnsafe("2026-08-05T01:00:00.000Z");

function thread(input: {
  readonly environmentId?: string;
  readonly threadId?: string;
  readonly turnId?: string | null;
  readonly turnState?: "running" | "interrupted" | "completed" | "failed" | null;
}): EnvironmentThreadShell {
  const turnId = input.turnId === undefined ? "turn-1" : input.turnId;
  const turnState = input.turnState === undefined ? "running" : input.turnState;
  const threadId = (input.threadId ?? "thread-1") as never;

  return presentThreadShell((input.environmentId ?? "environment-1") as never, {
    id: threadId,
    projectId: "project-1" as never,
    title: "Notification work",
    providerInstanceId: "codex" as never,
    modelSelection: { instanceId: "codex" as never, model: "gpt-5" },
    runtimeMode: "full-access",
    interactionMode: "default",
    branch: null,
    worktreePath: null,
    activeProviderThreadId: null,
    lineage: { rootThreadId: threadId, parentThreadId: null, relationshipToParent: null },
    forkedFrom: null,
    createdBy: "user",
    creationSource: "web",
    latestRunId: turnId === null || turnState === null ? null : (turnId as never),
    activeRunId: null,
    status: turnState ?? "idle",
    pendingRuntimeRequest: null,
    latestVisibleMessage: null,
    latestUserMessageAt: STARTED_AT,
    hasActionableProposedPlan: false,
    itemCount: 0,
    visibleItemCount: 0,
    createdAt: STARTED_AT,
    updatedAt: STARTED_AT,
    archivedAt: null,
    settledOverride: null,
    settledAt: null,
    lastVisitedAt: null,
    deletedAt: null,
  });
}

describe("detectAgentCompletions", () => {
  it("uses the first bootstrapped snapshot as a baseline", () => {
    const result = detectAgentCompletions({
      state: createAgentCompletionTrackerState(),
      threads: [thread({ turnState: "completed" })],
      bootstrapped: true,
    });

    expect(result.completions).toEqual([]);
    expect(result.state.initialized).toBe(true);
  });

  it("reports a running turn exactly once when it completes", () => {
    const running = detectAgentCompletions({
      state: createAgentCompletionTrackerState(),
      threads: [thread({ turnState: "running" })],
      bootstrapped: true,
    });
    const completedThread = thread({ turnState: "completed" });
    const completed = detectAgentCompletions({
      state: running.state,
      threads: [completedThread],
      bootstrapped: true,
    });
    const unchanged = detectAgentCompletions({
      state: completed.state,
      threads: [completedThread],
      bootstrapped: true,
    });

    expect(completed.completions).toEqual([completedThread]);
    expect(unchanged.completions).toEqual([]);
  });

  it("does not alert for interrupted or failed turns", () => {
    const baseline = detectAgentCompletions({
      state: createAgentCompletionTrackerState(),
      threads: [thread({ turnState: "running" })],
      bootstrapped: true,
    });

    const interrupted = detectAgentCompletions({
      state: baseline.state,
      threads: [thread({ turnState: "interrupted" })],
      bootstrapped: true,
    });
    const failed = detectAgentCompletions({
      state: interrupted.state,
      threads: [thread({ turnState: "failed", turnId: "turn-2" })],
      bootstrapped: true,
    });

    expect(interrupted.completions).toEqual([]);
    expect(failed.completions).toEqual([]);
  });

  it("tracks the same thread id independently across environments", () => {
    const baseline = detectAgentCompletions({
      state: createAgentCompletionTrackerState(),
      threads: [
        thread({ environmentId: "environment-1", turnState: "running" }),
        thread({ environmentId: "environment-2", turnState: "running" }),
      ],
      bootstrapped: true,
    });
    const remoteCompletion = thread({
      environmentId: "environment-2",
      turnState: "completed",
    });
    const result = detectAgentCompletions({
      state: baseline.state,
      threads: [thread({ environmentId: "environment-1", turnState: "running" }), remoteCompletion],
      bootstrapped: true,
    });

    expect(result.completions).toEqual([remoteCompletion]);
  });

  it("waits for shell bootstrap before changing its baseline", () => {
    const waiting = detectAgentCompletions({
      state: createAgentCompletionTrackerState(),
      threads: [thread({ turnState: "running" })],
      bootstrapped: false,
    });

    expect(waiting.state.initialized).toBe(false);
    expect(waiting.completions).toEqual([]);
  });
});
