import { EnvironmentId, ProjectId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { DraftId, type DraftSessionState } from "./composerDraftStore";
import type { SidebarThreadSummary } from "./types";
import {
  buildProjectWorkspaces,
  projectWorkspaceKey,
  selectClosedWorkspaceSessions,
  selectWorkspaceEntrySession,
} from "./workspaceSessions";

const environmentId = EnvironmentId.make("env-1");
const projectId = ProjectId.make("project-1");
const member = { environmentId, id: projectId, workspaceRoot: "/repo" };

function thread(input: {
  id: string;
  branch: string;
  worktreePath: string | null;
  updatedAt: string;
}): SidebarThreadSummary {
  return {
    environmentId,
    id: ThreadId.make(input.id),
    projectId,
    title: input.id,
    branch: input.branch,
    worktreePath: input.worktreePath,
    updatedAt: input.updatedAt,
    createdAt: input.updatedAt,
    archivedAt: null,
    latestTurn: null,
    latestUserMessageAt: null,
    session: null,
    modelSelection: { instanceId: "codex", model: "gpt-5" },
    runtimeMode: "full-access",
    interactionMode: "default",
    settledOverride: null,
    settledAt: null,
    hasPendingApprovals: false,
    hasPendingUserInput: false,
    hasActionableProposedPlan: false,
  } as SidebarThreadSummary;
}

function draft(input: {
  draftId: string;
  threadId: string;
  branch: string;
  worktreePath: string | null;
}): DraftSessionState & { draftId: DraftId } {
  return {
    draftId: DraftId.make(input.draftId),
    threadId: ThreadId.make(input.threadId),
    environmentId,
    projectId,
    logicalProjectKey: "repo",
    createdAt: "2026-08-04T12:00:00.000Z",
    runtimeMode: "full-access",
    interactionMode: "default",
    branch: input.branch,
    worktreePath: input.worktreePath,
    envMode: input.worktreePath ? "worktree" : "local",
    startFromOrigin: false,
  } as DraftSessionState & { draftId: DraftId };
}

describe("buildProjectWorkspaces", () => {
  it("always includes the repository's original checkout as a workspace", () => {
    const workspaces = buildProjectWorkspaces({ members: [member], threads: [], drafts: [] });

    expect(workspaces).toEqual([
      expect.objectContaining({
        key: projectWorkspaceKey({ environmentId, projectId, worktreePath: null }),
        cwd: "/repo",
        worktreePath: null,
        sessions: [],
      }),
    ]);
  });

  it("groups chats by physical checkout, not globally or by chat title", () => {
    const workspaces = buildProjectWorkspaces({
      members: [member],
      threads: [
        thread({
          id: "main-a",
          branch: "main",
          worktreePath: null,
          updatedAt: "2026-08-04T10:00:00Z",
        }),
        thread({
          id: "main-b",
          branch: "main",
          worktreePath: null,
          updatedAt: "2026-08-04T11:00:00Z",
        }),
        thread({
          id: "feature-a",
          branch: "feature",
          worktreePath: "/repo-feature",
          updatedAt: "2026-08-04T09:00:00Z",
        }),
      ],
      drafts: [
        draft({
          draftId: "draft-feature",
          threadId: "feature-b",
          branch: "feature",
          worktreePath: "/repo-feature",
        }),
      ],
    });

    expect(workspaces).toHaveLength(2);
    expect(workspaces[0]?.sessions.map((session) => session.threadId)).toEqual([
      "main-b",
      "main-a",
    ]);
    expect(workspaces[1]).toEqual(
      expect.objectContaining({
        cwd: "/repo-feature",
        worktreePath: "/repo-feature",
      }),
    );
    expect(workspaces[1]?.sessions.map((session) => session.threadId)).toEqual([
      "feature-b",
      "feature-a",
    ]);
  });

  it("replaces a promoted draft with its server session", () => {
    const workspaces = buildProjectWorkspaces({
      members: [member],
      threads: [
        thread({
          id: "same-id",
          branch: "main",
          worktreePath: null,
          updatedAt: "2026-08-04T13:00:00Z",
        }),
      ],
      drafts: [
        draft({ draftId: "draft", threadId: "same-id", branch: "main", worktreePath: null }),
      ],
    });

    expect(workspaces[0]?.sessions).toHaveLength(1);
    expect(workspaces[0]?.sessions[0]?.draftId).toBeNull();
  });

  it("keeps only closed chats in workspace history", () => {
    const workspaces = buildProjectWorkspaces({
      members: [member],
      threads: [
        thread({
          id: "open-chat",
          branch: "main",
          worktreePath: null,
          updatedAt: "2026-08-04T13:00:00Z",
        }),
        thread({
          id: "closed-chat",
          branch: "main",
          worktreePath: null,
          updatedAt: "2026-08-04T12:00:00Z",
        }),
      ],
      drafts: [],
    });

    expect(
      selectClosedWorkspaceSessions(
        workspaces[0]?.sessions ?? [],
        new Set([workspaces[0]?.sessions[0]?.key ?? ""]),
      ),
    ).toEqual([
      expect.objectContaining({
        title: "closed-chat",
        threadId: "closed-chat",
      }),
    ]);
  });

  it("keeps a closed draft's route identity in workspace history", () => {
    const workspaces = buildProjectWorkspaces({
      members: [member],
      threads: [],
      drafts: [
        draft({
          draftId: "closed-draft",
          threadId: "draft-thread",
          branch: "main",
          worktreePath: null,
        }),
      ],
    });

    expect(selectClosedWorkspaceSessions(workspaces[0]?.sessions ?? [], new Set())).toEqual([
      expect.objectContaining({
        draftId: "closed-draft",
        threadId: "draft-thread",
        title: "New thread",
      }),
    ]);
  });
});

describe("selectWorkspaceEntrySession", () => {
  it("opens the workspace's own active tab", () => {
    const workspaces = buildProjectWorkspaces({
      members: [member],
      threads: [
        thread({
          id: "older",
          branch: "main",
          worktreePath: null,
          updatedAt: "2024-01-01T00:00:00Z",
        }),
        thread({
          id: "newer",
          branch: "main",
          worktreePath: null,
          updatedAt: "2024-01-02T00:00:00Z",
        }),
      ],
      drafts: [],
    });
    const sessions = workspaces[0]?.sessions ?? [];
    const older = sessions.find((session) => session.threadId === "older");

    expect(
      selectWorkspaceEntrySession({ sessions, activeTabKey: older?.key ?? null })?.threadId,
    ).toBe("older");
  });

  it("ignores a tab whose chat moved to another checkout", () => {
    const workspaces = buildProjectWorkspaces({
      members: [member],
      threads: [
        thread({
          id: "stayed",
          branch: "main",
          worktreePath: null,
          updatedAt: "2024-01-01T00:00:00Z",
        }),
        thread({
          id: "moved",
          branch: "feature",
          worktreePath: "/repo/.worktrees/feature",
          updatedAt: "2024-01-02T00:00:00Z",
        }),
      ],
      drafts: [],
    });
    const base = workspaces.find((workspace) => workspace.worktreePath === null);
    const worktree = workspaces.find((workspace) => workspace.worktreePath !== null);
    const movedKey = worktree?.sessions[0]?.key ?? null;

    expect(
      selectWorkspaceEntrySession({ sessions: base?.sessions ?? [], activeTabKey: movedKey })
        ?.threadId,
    ).toBe("stayed");
  });

  it("returns null when the checkout has no chats at all", () => {
    expect(selectWorkspaceEntrySession({ sessions: [], activeTabKey: "whatever" })).toBeNull();
  });
});
