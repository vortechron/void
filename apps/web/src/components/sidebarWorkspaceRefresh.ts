import type { EnvironmentId, ThreadId } from "@t3tools/contracts";

import { hasUnseenCompletion } from "./Sidebar.logic";

type RefreshThreadInput = Parameters<typeof hasUnseenCompletion>[0];

interface RefreshSessionInput {
  readonly key: string;
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
}

export interface WorkspaceStatusRefreshTarget {
  readonly key: string;
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
}

export interface WorkspaceStatusRefreshPlan {
  /** Sessions still projected as `error` keep the workspace row's Failed icon lit. */
  readonly stopSession: readonly WorkspaceStatusRefreshTarget[];
  /** Completions the user never opened keep the workspace row's Completed icon lit. */
  readonly markVisited: readonly WorkspaceStatusRefreshTarget[];
}

/**
 * Plans the writes that clear a workspace row's stale status icon.
 *
 * A row aggregates every chat in one checkout, and closing a chat's tab does
 * not detach the chat from the row, so a session that died (a provider crash,
 * a server restart) or a completion that was never opened keeps its icon lit
 * with no way back. Approvals, pending input and live work are deliberately
 * left alone: those still need the user rather than a reset.
 */
export function planWorkspaceStatusRefresh(input: {
  readonly sessions: readonly RefreshSessionInput[];
  readonly threadByKey: ReadonlyMap<string, RefreshThreadInput>;
  readonly lastVisitedAtByThreadKey: ReadonlyMap<string, string | null>;
}): WorkspaceStatusRefreshPlan {
  const stopSession: WorkspaceStatusRefreshTarget[] = [];
  const markVisited: WorkspaceStatusRefreshTarget[] = [];

  for (const session of input.sessions) {
    const thread = input.threadByKey.get(session.key);
    if (!thread) continue;

    const target: WorkspaceStatusRefreshTarget = {
      key: session.key,
      environmentId: session.environmentId,
      threadId: session.threadId,
    };

    // A usage-limited run stays: it can resume on its own once the limit resets.
    if (thread.runtime?.status === "failed" && thread.runtime.lastErrorClass !== "usage_limit") {
      stopSession.push(target);
    }

    const lastVisitedAt = input.lastVisitedAtByThreadKey.get(session.key) ?? undefined;
    if (hasUnseenCompletion({ ...thread, lastVisitedAt })) {
      markVisited.push(target);
    }
  }

  return { stopSession, markVisited };
}

/** How many chats the refresh would touch; 0 means the row has nothing stale. */
export function workspaceStatusRefreshCount(plan: WorkspaceStatusRefreshPlan): number {
  const keys = new Set<string>();
  for (const target of plan.stopSession) keys.add(target.key);
  for (const target of plan.markVisited) keys.add(target.key);
  return keys.size;
}
