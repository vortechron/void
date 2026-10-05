import { describe, expect, it } from "vite-plus/test";

import type { SidebarThreadSummary } from "../types";
import {
  resolveProjectGroupStatus,
  resolveProjectGroupStatusById,
} from "./sidebarProjectGroupStatus";
import type { resolveThreadAttentionStatus } from "./sidebarWorkspaceStatus";

/** Old session states on the V2 runtime: ready and stopped sessions hold no run. */
function runtimeFor(
  status: "error" | "ready" | "running" | "starting" | "stopped" | undefined,
): SidebarThreadSummary["runtime"] {
  if (status === undefined || status === "ready" || status === "stopped") return null;
  return {
    status: status === "error" ? "failed" : status,
    activeRunId: null,
    providerInstanceId: "codex",
    providerName: null,
    lastError: null,
    updatedAt: "2026-08-05T10:00:00.000Z",
  } as SidebarThreadSummary["runtime"];
}

function thread(input: {
  status?: "error" | "ready" | "running" | "starting" | "stopped";
  hasPendingApprovals?: boolean;
  hasPendingUserInput?: boolean;
  hasActionableProposedPlan?: boolean;
  interactionMode?: "default" | "plan";
  completedAt?: string | null;
  lastVisitedAt?: string;
}): Parameters<typeof resolveThreadAttentionStatus>[0] {
  const latestRun =
    input.completedAt === undefined
      ? null
      : ({
          runId: "turn-1",
          status: "completed",
          assistantMessageId: null,
          requestedAt: "2026-08-05T10:00:00.000Z",
          startedAt: "2026-08-05T10:00:00.000Z",
          completedAt: input.completedAt,
        } as SidebarThreadSummary["latestRun"]);

  return {
    hasActionableProposedPlan: input.hasActionableProposedPlan ?? false,
    hasPendingApprovals: input.hasPendingApprovals ?? false,
    hasPendingUserInput: input.hasPendingUserInput ?? false,
    interactionMode: input.interactionMode ?? "default",
    latestRun,
    lastVisitedAt: input.lastVisitedAt,
    runtime: runtimeFor(input.status),
  };
}

const workingThread = thread({ status: "running" });
// "Completed" means finished since you last looked, so the fixture needs a
// visit that predates the finish.
const completedThread = thread({
  status: "ready",
  completedAt: "2026-08-05T10:05:00.000Z",
  lastVisitedAt: "2026-08-05T10:00:00.000Z",
});
const idleThread = thread({ status: "ready" });

describe("resolveProjectGroupStatus", () => {
  it("reports nothing for a group with no chats", () => {
    expect(resolveProjectGroupStatus([])).toBeNull();
  });

  it("reports nothing when every chat is merely ready", () => {
    expect(resolveProjectGroupStatus([idleThread, idleThread])).toBeNull();
  });

  it("shows the working state while any chat in the group runs", () => {
    expect(resolveProjectGroupStatus([idleThread, workingThread])).toBe("working");
  });

  it("shows the completed state when a chat finished and none are running", () => {
    expect(resolveProjectGroupStatus([idleThread, completedThread])).toBe("completed");
  });

  it("lets working outrank completed so in-progress work is never hidden", () => {
    expect(resolveProjectGroupStatus([completedThread, workingThread])).toBe("working");
  });

  it("lets approval outrank working, matching the workspace rows", () => {
    expect(
      resolveProjectGroupStatus([
        workingThread,
        thread({ status: "ready", hasPendingApprovals: true }),
      ]),
    ).toBe("approval");
  });

  it("drops the completed state once the chat has been viewed again", () => {
    const viewed = thread({
      status: "ready",
      completedAt: "2026-08-05T10:05:00.000Z",
      lastVisitedAt: "2026-08-05T10:06:00.000Z",
    });
    expect(resolveProjectGroupStatus([viewed])).toBeNull();
  });
});

describe("resolveProjectGroupStatusById", () => {
  const threadsByProjectKey = new Map([
    ["a", [idleThread]],
    ["b", [workingThread]],
    ["c", [completedThread]],
  ]);

  it("gives each group the loudest status among its projects", () => {
    const statuses = resolveProjectGroupStatusById({
      groups: [
        { id: "g1", projectKeys: ["a", "b"] },
        { id: "g2", projectKeys: ["a", "c"] },
      ],
      threadsByProjectKey,
    });
    expect(statuses.get("g1")).toBe("working");
    expect(statuses.get("g2")).toBe("completed");
  });

  it("omits groups where nothing is happening", () => {
    const statuses = resolveProjectGroupStatusById({
      groups: [{ id: "g1", projectKeys: ["a"] }],
      threadsByProjectKey,
    });
    expect(statuses.has("g1")).toBe(false);
  });

  it("omits empty groups and groups whose projects have no chats", () => {
    const statuses = resolveProjectGroupStatusById({
      groups: [
        { id: "empty", projectKeys: [] },
        { id: "unknown", projectKeys: ["zzz"] },
      ],
      threadsByProjectKey,
    });
    expect(statuses.size).toBe(0);
  });

  it("counts a project that belongs to several groups for each of them", () => {
    const statuses = resolveProjectGroupStatusById({
      groups: [
        { id: "g1", projectKeys: ["b"] },
        { id: "g2", projectKeys: ["b"] },
      ],
      threadsByProjectKey,
    });
    expect(statuses.get("g1")).toBe("working");
    expect(statuses.get("g2")).toBe("working");
  });
});
