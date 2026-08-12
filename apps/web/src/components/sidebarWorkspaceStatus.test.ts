import type { SidebarThreadSummary } from "../types";
import { describe, expect, it } from "vite-plus/test";

import {
  resolveSidebarWorkspaceStatus,
  resolveThreadAttentionStatus,
} from "./sidebarWorkspaceStatus";

function thread(input: {
  status?: "error" | "ready" | "running" | "starting" | "stopped";
  hasPendingApprovals?: boolean;
  hasPendingUserInput?: boolean;
  hasActionableProposedPlan?: boolean;
  interactionMode?: "default" | "plan";
  completedAt?: string | null;
  lastVisitedAt?: string;
}): Parameters<typeof resolveThreadAttentionStatus>[0] {
  const latestTurn =
    input.completedAt === undefined
      ? null
      : ({
          turnId: "turn-1",
          state: "completed",
          assistantMessageId: null,
          requestedAt: "2026-08-05T10:00:00.000Z",
          startedAt: "2026-08-05T10:00:00.000Z",
          completedAt: input.completedAt,
        } as SidebarThreadSummary["latestTurn"]);

  return {
    hasActionableProposedPlan: input.hasActionableProposedPlan ?? false,
    hasPendingApprovals: input.hasPendingApprovals ?? false,
    hasPendingUserInput: input.hasPendingUserInput ?? false,
    interactionMode: input.interactionMode ?? "default",
    latestTurn,
    lastVisitedAt: input.lastVisitedAt,
    session: input.status
      ? ({ status: input.status, activeTurnId: null } as SidebarThreadSummary["session"])
      : null,
  };
}

describe("resolveSidebarWorkspaceStatus", () => {
  it("uses the loading state while any chat in the workspace is working", () => {
    expect(
      resolveSidebarWorkspaceStatus([thread({ status: "ready" }), thread({ status: "running" })]),
    ).toBe("working");
    expect(resolveSidebarWorkspaceStatus([thread({ status: "starting" })])).toBe("working");
  });

  it("prioritizes states that need user attention", () => {
    expect(
      resolveSidebarWorkspaceStatus([
        thread({ status: "running" }),
        thread({ hasPendingUserInput: true }),
        thread({ hasPendingApprovals: true }),
      ]),
    ).toBe("approval");
  });

  it("shows failures ahead of active chats when nothing is waiting on the user", () => {
    expect(
      resolveSidebarWorkspaceStatus([thread({ status: "running" }), thread({ status: "error" })]),
    ).toBe("failed");
  });

  it("keeps a completed chat highlighted until that chat is visited", () => {
    const completedAt = "2026-08-05T10:05:00.000Z";

    expect(
      resolveThreadAttentionStatus(
        thread({
          status: "ready",
          completedAt,
          lastVisitedAt: "2026-08-05T10:04:00.000Z",
        }),
      ),
    ).toBe("completed");
    expect(
      resolveThreadAttentionStatus(
        thread({
          status: "ready",
          completedAt,
          lastVisitedAt: "2026-08-05T10:06:00.000Z",
        }),
      ),
    ).toBe("ready");
  });

  it("keeps the workspace completed while any completed chat remains unvisited", () => {
    const completedAt = "2026-08-05T10:05:00.000Z";
    const seen = thread({
      status: "ready",
      completedAt,
      lastVisitedAt: "2026-08-05T10:06:00.000Z",
    });
    const unseen = thread({
      status: "ready",
      completedAt,
      lastVisitedAt: "2026-08-05T10:04:00.000Z",
    });

    expect(resolveSidebarWorkspaceStatus([seen, seen, unseen])).toBe("completed");
    expect(resolveSidebarWorkspaceStatus([seen, seen, seen])).toBe("ready");
  });

  it("shows an actionable completed plan before a regular completion", () => {
    expect(
      resolveThreadAttentionStatus(
        thread({
          status: "ready",
          interactionMode: "plan",
          hasActionableProposedPlan: true,
          completedAt: "2026-08-05T10:05:00.000Z",
          lastVisitedAt: "2026-08-05T10:04:00.000Z",
        }),
      ),
    ).toBe("plan");
  });

  it("defaults to the branch state for an idle or empty workspace", () => {
    expect(resolveSidebarWorkspaceStatus([thread({ status: "stopped" })])).toBe("ready");
    expect(resolveSidebarWorkspaceStatus([])).toBe("ready");
  });
});
