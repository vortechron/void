import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentId, ProjectId, ScopedProjectRef, ThreadId } from "@t3tools/contracts";

import type { DraftId, DraftSessionState } from "./composerDraftStore";
import type { SidebarThreadSummary } from "./types";

const BASE_CHECKOUT = "base";

export interface WorkspaceProjectMember {
  readonly environmentId: EnvironmentId;
  readonly id: ProjectId;
  readonly workspaceRoot: string;
}

export interface WorkspaceSession {
  readonly key: string;
  readonly environmentId: EnvironmentId;
  readonly projectId: ProjectId;
  readonly threadId: ThreadId;
  readonly draftId: DraftId | null;
  readonly title: string;
  readonly branch: string | null;
  readonly worktreePath: string | null;
  readonly updatedAt: string;
}

export interface ProjectWorkspace {
  readonly key: string;
  readonly projectRef: ScopedProjectRef;
  readonly projectRoot: string;
  readonly cwd: string;
  readonly worktreePath: string | null;
  readonly branch: string | null;
  readonly sessions: readonly WorkspaceSession[];
}

/**
 * A workspace is a physical checkout, not a branch name and not a chat.
 * The repository's original checkout is one stable workspace even when its
 * current branch changes; every linked worktree is another workspace.
 */
export function projectWorkspaceKey(input: {
  readonly environmentId: EnvironmentId;
  readonly projectId: ProjectId;
  readonly worktreePath: string | null;
}): string {
  return JSON.stringify([
    input.environmentId,
    input.projectId,
    input.worktreePath ?? BASE_CHECKOUT,
  ]);
}

export function workspaceSessionKey(input: {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
}): string {
  return scopedThreadKey(scopeThreadRef(input.environmentId, input.threadId));
}

export function workspaceFallbackLabel(input: {
  readonly worktreePath: string | null;
  readonly branch: string | null;
}): string {
  if (input.branch?.trim()) return input.branch;
  if (input.worktreePath) {
    const parts = input.worktreePath.split(/[\\/]/).filter(Boolean);
    return parts[parts.length - 1] ?? input.worktreePath;
  }
  return "Current checkout";
}

/**
 * Picks the chat a workspace row should open. The saved tab strip can outlive
 * the chat it points at — promoting a draft into a worktree moves that chat to
 * another checkout — so only a chat this checkout still owns may win, and the
 * most recent one is the fallback.
 */
export function selectWorkspaceEntrySession(input: {
  readonly sessions: readonly WorkspaceSession[];
  readonly activeTabKey: string | null;
}): WorkspaceSession | null {
  const active =
    input.activeTabKey === null
      ? null
      : (input.sessions.find((session) => session.key === input.activeTabKey) ?? null);
  return active ?? input.sessions[0] ?? null;
}

/** Closed tabs stay discoverable without mixing in another checkout's chats. */
export function selectClosedWorkspaceSessions(
  sessions: readonly WorkspaceSession[],
  openSessionKeys: ReadonlySet<string>,
): readonly WorkspaceSession[] {
  return sessions.filter((session) => !openSessionKeys.has(session.key));
}

type DraftSessionEntry = DraftSessionState & { readonly draftId: DraftId };

/** Builds repository -> workspace -> session grouping for the Conductor-style UI. */
export function buildProjectWorkspaces(input: {
  readonly members: readonly WorkspaceProjectMember[];
  readonly threads: readonly SidebarThreadSummary[];
  readonly drafts: readonly DraftSessionEntry[];
}): readonly ProjectWorkspace[] {
  const memberByProject = new Map(
    input.members.map(
      (member) => [JSON.stringify([member.environmentId, member.id]), member] as const,
    ),
  );
  const sessionsByWorkspace = new Map<string, WorkspaceSession[]>();
  const workspaceMetadata = new Map<
    string,
    {
      member: WorkspaceProjectMember;
      worktreePath: string | null;
      branch: string | null;
    }
  >();

  const ensureWorkspace = (
    member: WorkspaceProjectMember,
    worktreePath: string | null,
    branch: string | null,
  ) => {
    const key = projectWorkspaceKey({
      environmentId: member.environmentId,
      projectId: member.id,
      worktreePath,
    });
    const current = workspaceMetadata.get(key);
    workspaceMetadata.set(key, {
      member,
      worktreePath,
      branch: current?.branch ?? branch,
    });
    if (!sessionsByWorkspace.has(key)) sessionsByWorkspace.set(key, []);
    return key;
  };

  // The original checkout is always a workspace, including a clean repository
  // with no chat sessions yet.
  for (const member of input.members) ensureWorkspace(member, null, null);

  const liveServerSessionKeys = new Set<string>();
  for (const thread of input.threads) {
    if (thread.archivedAt !== null) continue;
    const member = memberByProject.get(JSON.stringify([thread.environmentId, thread.projectId]));
    if (!member) continue;
    const sessionKey = workspaceSessionKey({
      environmentId: thread.environmentId,
      threadId: thread.id,
    });
    liveServerSessionKeys.add(sessionKey);
    const workspaceKey = ensureWorkspace(member, thread.worktreePath, thread.branch);
    sessionsByWorkspace.get(workspaceKey)!.push({
      key: sessionKey,
      environmentId: thread.environmentId,
      projectId: thread.projectId,
      threadId: thread.id,
      draftId: null,
      title: thread.title,
      branch: thread.branch,
      worktreePath: thread.worktreePath,
      updatedAt: thread.updatedAt,
    });
  }

  for (const draft of input.drafts) {
    if (draft.promotedTo != null) continue;
    const member = memberByProject.get(JSON.stringify([draft.environmentId, draft.projectId]));
    if (!member) continue;
    const sessionKey = workspaceSessionKey(draft);
    // Promotion keeps the preallocated thread id. Once the server shell lands,
    // it replaces the draft instead of appearing as a second tab.
    if (liveServerSessionKeys.has(sessionKey)) continue;
    const workspaceKey = ensureWorkspace(member, draft.worktreePath, draft.branch);
    sessionsByWorkspace.get(workspaceKey)!.push({
      key: sessionKey,
      environmentId: draft.environmentId,
      projectId: draft.projectId,
      threadId: draft.threadId,
      draftId: draft.draftId,
      title: "New thread",
      branch: draft.branch,
      worktreePath: draft.worktreePath,
      updatedAt: draft.createdAt,
    });
  }

  return [...workspaceMetadata.entries()]
    .map(([key, metadata]): ProjectWorkspace => ({
      key,
      projectRef: {
        environmentId: metadata.member.environmentId,
        projectId: metadata.member.id,
      },
      projectRoot: metadata.member.workspaceRoot,
      cwd: metadata.worktreePath ?? metadata.member.workspaceRoot,
      worktreePath: metadata.worktreePath,
      branch: metadata.branch,
      sessions: [...(sessionsByWorkspace.get(key) ?? [])].sort((left, right) =>
        right.updatedAt.localeCompare(left.updatedAt),
      ),
    }))
    .sort((left, right) => {
      if (left.worktreePath === null && right.worktreePath !== null) return -1;
      if (left.worktreePath !== null && right.worktreePath === null) return 1;
      return (right.sessions[0]?.updatedAt ?? "").localeCompare(left.sessions[0]?.updatedAt ?? "");
    });
}
