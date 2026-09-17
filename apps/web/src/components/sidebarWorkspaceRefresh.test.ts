import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import type { SidebarThreadSummary } from "../types";
import { planWorkspaceStatusRefresh, workspaceStatusRefreshCount } from "./sidebarWorkspaceRefresh";

type PlanInput = Parameters<typeof planWorkspaceStatusRefresh>[0];
type ThreadInput = PlanInput["threadByKey"] extends ReadonlyMap<string, infer T> ? T : never;

const ENVIRONMENT_ID = "env-1" as EnvironmentId;

function session(key: string): PlanInput["sessions"][number] {
  return {
    key,
    environmentId: ENVIRONMENT_ID,
    threadId: `thread-${key}` as ThreadId,
  };
}

function thread(input: {
  status?: "error" | "ready" | "running" | "stopped";
  completedAt?: string;
  hasPendingApprovals?: boolean;
}): ThreadInput {
  return {
    hasActionableProposedPlan: false,
    hasPendingApprovals: input.hasPendingApprovals ?? false,
    hasPendingUserInput: false,
    interactionMode: "default",
    latestTurn: input.completedAt
      ? ({
          turnId: "turn-1",
          state: "completed",
          assistantMessageId: null,
          requestedAt: input.completedAt,
          startedAt: input.completedAt,
          completedAt: input.completedAt,
        } as SidebarThreadSummary["latestTurn"])
      : null,
    session: input.status
      ? ({ status: input.status, activeTurnId: null } as SidebarThreadSummary["session"])
      : null,
  };
}

describe("planWorkspaceStatusRefresh", () => {
  it("stops the sessions a dead provider left in error", () => {
    const plan = planWorkspaceStatusRefresh({
      sessions: [session("a"), session("b")],
      threadByKey: new Map([
        ["a", thread({ status: "error" })],
        ["b", thread({ status: "ready" })],
      ]),
      lastVisitedAtByThreadKey: new Map(),
    });

    expect(plan.stopSession.map((target) => target.key)).toEqual(["a"]);
    expect(plan.markVisited).toEqual([]);
  });

  it("marks a completion the user never opened as seen", () => {
    const plan = planWorkspaceStatusRefresh({
      sessions: [session("a")],
      threadByKey: new Map([["a", thread({ completedAt: "2026-09-17T10:00:00.000Z" })]]),
      lastVisitedAtByThreadKey: new Map([["a", "2026-09-17T09:00:00.000Z"]]),
    });

    expect(plan.markVisited.map((target) => target.key)).toEqual(["a"]);
  });

  it("leaves a completion the user already opened alone", () => {
    const plan = planWorkspaceStatusRefresh({
      sessions: [session("a")],
      threadByKey: new Map([["a", thread({ completedAt: "2026-09-17T10:00:00.000Z" })]]),
      lastVisitedAtByThreadKey: new Map([["a", "2026-09-17T11:00:00.000Z"]]),
    });

    expect(plan.markVisited).toEqual([]);
  });

  it("never touches a running session or a pending approval", () => {
    const plan = planWorkspaceStatusRefresh({
      sessions: [session("a"), session("b")],
      threadByKey: new Map([
        ["a", thread({ status: "running" })],
        ["b", thread({ status: "ready", hasPendingApprovals: true })],
      ]),
      lastVisitedAtByThreadKey: new Map(),
    });

    expect(plan).toEqual({ stopSession: [], markVisited: [] });
  });

  it("skips sessions with no server thread, such as unsent drafts", () => {
    const plan = planWorkspaceStatusRefresh({
      sessions: [session("draft")],
      threadByKey: new Map(),
      lastVisitedAtByThreadKey: new Map(),
    });

    expect(plan).toEqual({ stopSession: [], markVisited: [] });
  });
});

describe("workspaceStatusRefreshCount", () => {
  it("counts a chat that is both errored and unseen once", () => {
    const plan = planWorkspaceStatusRefresh({
      sessions: [session("a")],
      threadByKey: new Map([
        ["a", thread({ status: "error", completedAt: "2026-09-17T10:00:00.000Z" })],
      ]),
      lastVisitedAtByThreadKey: new Map([["a", "2026-09-17T09:00:00.000Z"]]),
    });

    expect(plan.stopSession).toHaveLength(1);
    expect(plan.markVisited).toHaveLength(1);
    expect(workspaceStatusRefreshCount(plan)).toBe(1);
  });

  it("reports nothing to refresh for a calm workspace", () => {
    expect(
      workspaceStatusRefreshCount(
        planWorkspaceStatusRefresh({
          sessions: [session("a")],
          threadByKey: new Map([["a", thread({ status: "ready" })]]),
          lastVisitedAtByThreadKey: new Map(),
        }),
      ),
    ).toBe(0);
  });
});
