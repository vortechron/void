import { describe, expect, it } from "vite-plus/test";

import type { SidebarThreadSummary } from "~/types";
import { workspaceSessionKey } from "~/workspaceSessions";

import { resolveSessionStatusesByKey } from "./workspaceHistoryStatus";

const ENVIRONMENT_ID = "env-1" as SidebarThreadSummary["environmentId"];

function thread(input: {
  readonly id: string;
  readonly status?: "error" | "ready" | "running";
  readonly hasPendingApprovals?: boolean;
}): SidebarThreadSummary {
  return {
    environmentId: ENVIRONMENT_ID,
    id: input.id as SidebarThreadSummary["id"],
    hasActionableProposedPlan: false,
    hasPendingApprovals: input.hasPendingApprovals ?? false,
    hasPendingUserInput: false,
    interactionMode: "default",
    latestRun: null,
    runtime:
      input.status === "running" || input.status === "error"
        ? ({
            status: input.status === "error" ? "failed" : "running",
            activeRunId: null,
            providerInstanceId: "codex",
            providerName: null,
            lastError: null,
            updatedAt: "2026-09-16T10:00:00.000Z",
          } as SidebarThreadSummary["runtime"])
        : null,
  } as unknown as SidebarThreadSummary;
}

const sessionKey = (threadId: string) =>
  workspaceSessionKey({
    environmentId: ENVIRONMENT_ID,
    threadId: threadId as SidebarThreadSummary["id"],
  });

describe("resolveSessionStatusesByKey", () => {
  it("keys each chat's attention status by its workspace session key", () => {
    const statuses = resolveSessionStatusesByKey({
      threads: [
        thread({ id: "broken", status: "error" }),
        thread({ id: "calm", status: "ready" }),
        thread({ id: "blocked", hasPendingApprovals: true }),
      ],
      lastVisitedAtByThreadKey: {},
    });

    expect(statuses.get(sessionKey("broken"))).toBe("failed");
    expect(statuses.get(sessionKey("calm"))).toBe("ready");
    expect(statuses.get(sessionKey("blocked"))).toBe("approval");
  });

  it("reports a completion the user has not seen since their last visit", () => {
    const completed = {
      ...thread({ id: "done", status: "ready" }),
      latestRun: {
        runId: "turn-1",
        status: "completed",
        assistantMessageId: null,
        requestedAt: "2026-09-16T10:00:00.000Z",
        startedAt: "2026-09-16T10:00:00.000Z",
        completedAt: "2026-09-16T10:05:00.000Z",
      } as SidebarThreadSummary["latestRun"],
    };

    expect(
      resolveSessionStatusesByKey({
        threads: [completed],
        lastVisitedAtByThreadKey: { [sessionKey("done")]: "2026-09-16T10:01:00.000Z" },
      }).get(sessionKey("done")),
    ).toBe("completed");

    expect(
      resolveSessionStatusesByKey({
        threads: [completed],
        lastVisitedAtByThreadKey: { [sessionKey("done")]: "2026-09-16T10:09:00.000Z" },
      }).get(sessionKey("done")),
    ).toBe("ready");
  });
});
