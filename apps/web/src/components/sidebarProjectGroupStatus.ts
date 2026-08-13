/**
 * Rolls every chat inside a project group up into one status, so the group
 * filter dropdown can show at a glance which groups need attention.
 *
 * The rules are the same ones the workspace rows already use
 * (`resolveSidebarWorkspaceStatus`): the loudest status in the group wins, so
 * one working chat shows the loader and one finished chat shows the check.
 * "Ready" means nothing is happening, so it collapses to `null` and the
 * dropdown row stays bare rather than growing a meaningless icon.
 */

import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";

import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { SidebarThreadSummary } from "../types";
import { useUiStateStore } from "../uiStateStore";
import {
  resolveSidebarWorkspaceStatus,
  type ThreadAttentionStatus,
} from "./sidebarWorkspaceStatus";

type StatusThread = Parameters<typeof resolveSidebarWorkspaceStatus>[0][number];

export interface StatusGroup {
  readonly id: string;
  readonly projectKeys: readonly string[];
}

export function resolveProjectGroupStatus(
  threads: readonly StatusThread[],
): ThreadAttentionStatus | null {
  if (threads.length === 0) return null;
  const status = resolveSidebarWorkspaceStatus(threads);
  return status === "ready" ? null : status;
}

/**
 * `threadsByProjectKey` must already be filtered to threads the sidebar shows
 * (no archived chats) and carry `lastVisitedAt`, otherwise a finished chat
 * would keep its check mark after you read it.
 *
 * A project in two groups counts for both — membership is not exclusive.
 */
export function resolveProjectGroupStatusById(input: {
  readonly groups: readonly StatusGroup[];
  readonly threadsByProjectKey: ReadonlyMap<string, readonly StatusThread[]>;
}): ReadonlyMap<string, ThreadAttentionStatus> {
  const statusById = new Map<string, ThreadAttentionStatus>();
  for (const group of input.groups) {
    const threads = group.projectKeys.flatMap(
      (projectKey) => input.threadsByProjectKey.get(projectKey) ?? [],
    );
    const status = resolveProjectGroupStatus(threads);
    if (status !== null) statusById.set(group.id, status);
  }
  return statusById;
}

const EMPTY_STATUS_BY_ID: ReadonlyMap<string, ThreadAttentionStatus> = new Map();

/**
 * Reads the "when did I last open this chat" timestamps the completed state
 * depends on, and only for chats inside a group — an ungrouped project cannot
 * change any badge, so it should not make this resubscribe.
 */
export function useProjectGroupStatusById(input: {
  readonly groups: readonly StatusGroup[];
  readonly visibleThreadsByProjectKey: ReadonlyMap<string, readonly SidebarThreadSummary[]>;
}): ReadonlyMap<string, ThreadAttentionStatus> {
  const { groups, visibleThreadsByProjectKey } = input;

  const groupedProjectKeys = useMemo(
    () => [...new Set(groups.flatMap((group) => group.projectKeys))],
    [groups],
  );
  const groupedThreads = useMemo(
    () =>
      groupedProjectKeys.flatMap((projectKey) => visibleThreadsByProjectKey.get(projectKey) ?? []),
    [groupedProjectKeys, visibleThreadsByProjectKey],
  );
  const threadKeys = useMemo(
    () =>
      groupedThreads.map((thread) =>
        scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)),
      ),
    [groupedThreads],
  );
  const lastVisitedAts = useUiStateStore(
    useShallow((state) => threadKeys.map((key) => state.threadLastVisitedAtById[key] ?? null)),
  );

  const threadsByProjectKey = useMemo(() => {
    const lastVisitedAtByThreadKey = new Map(
      threadKeys.map((key, index) => [key, lastVisitedAts[index] ?? null] as const),
    );
    const next = new Map<string, SidebarThreadSummary[]>();
    for (const projectKey of groupedProjectKeys) {
      next.set(
        projectKey,
        (visibleThreadsByProjectKey.get(projectKey) ?? []).map((thread) => {
          const lastVisitedAt = lastVisitedAtByThreadKey.get(
            scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)),
          );
          return lastVisitedAt === null || lastVisitedAt === undefined
            ? thread
            : { ...thread, lastVisitedAt };
        }),
      );
    }
    return next;
  }, [groupedProjectKeys, lastVisitedAts, threadKeys, visibleThreadsByProjectKey]);

  return useMemo(() => {
    if (groups.length === 0) return EMPTY_STATUS_BY_ID;
    return resolveProjectGroupStatusById({ groups, threadsByProjectKey });
  }, [groups, threadsByProjectKey]);
}
