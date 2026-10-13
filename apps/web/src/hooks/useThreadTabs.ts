import { scopeThreadRef, scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef } from "react";

import { useComposerDraftStore, type DraftId } from "../composerDraftStore";
import { useAllEnvironmentProjectSnapshotsReady, useThreadShells } from "../state/entities";
import { buildDraftThreadRouteParams, buildThreadRouteParams } from "../threadRoutes";
import {
  selectThreadTab,
  selectWorkspaceThreadTabs,
  threadTabRef,
  useThreadTabsStore,
} from "../threadTabsStore";
import { projectWorkspaceKey } from "../workspaceSessions";

/** Anything that names one chat: an open tab or a closed session from history. */
export interface ThreadTabTarget {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly draftId: DraftId | null;
}

/**
 * Shows a chat. The route sync below opens its tab, so this is the only step a
 * tab click, a history reopen, or a close that hands focus on needs.
 */
export function useOpenThreadTab(): (target: ThreadTabTarget) => void {
  const navigate = useNavigate();
  return useCallback(
    (target) => {
      if (target.draftId) {
        void navigate({
          to: "/draft/$draftId",
          params: buildDraftThreadRouteParams(target.draftId),
        });
        return;
      }
      void navigate({
        to: "/$environmentId/$threadId",
        params: buildThreadRouteParams(threadTabRef(target)),
      });
    },
    [navigate],
  );
}

/**
 * A chat closed on another device leaves this one the same way a local close
 * does. The signal present at mount is stale (it landed while another page was
 * showing), so only one that arrives while this chat is up moves the view.
 */
export function useFollowRemotelyClosedThreadTab(input: {
  workspaceKey: string | null;
  onNewThread: () => void;
}): void {
  const { workspaceKey, onNewThread } = input;
  const openThreadTab = useOpenThreadTab();
  const remotelyClosed = useThreadTabsStore((state) => state.remotelyClosedActiveTab);
  const handledRemotelyClosed = useRef(remotelyClosed);
  useEffect(() => {
    if (remotelyClosed === handledRemotelyClosed.current) return;
    handledRemotelyClosed.current = remotelyClosed;
    if (workspaceKey === null || remotelyClosed?.workspaceKey !== workspaceKey) return;
    const next = selectWorkspaceThreadTabs(useThreadTabsStore.getState(), workspaceKey);
    const nextTab = selectThreadTab(next, next.activeKey);
    if (nextTab) openThreadTab(nextTab);
    else onNewThread();
  }, [onNewThread, openThreadTab, remotelyClosed, workspaceKey]);
}

/**
 * Keeps the sidebar's open tabs in agreement with the route and with the threads that
 * actually exist.
 *
 * Syncing off the route rather than off click handlers is what makes every
 * entry point work: the sidebar, the command palette, a keybinding and a
 * pasted deep link all end up here.
 */
export function useThreadTabRouteSync(input: {
  environmentId: EnvironmentId;
  threadId: ThreadId;
  draftId: DraftId | null;
  workspaceKey: string | null;
}): void {
  const { environmentId, threadId, draftId, workspaceKey } = input;
  const openTab = useThreadTabsStore((state) => state.openTab);
  const reconcile = useThreadTabsStore((state) => state.reconcile);
  const threadShells = useThreadShells();
  const allEnvironmentProjectSnapshotsReady = useAllEnvironmentProjectSnapshotsReady();
  const draftThreads = useComposerDraftStore((store) => store.draftThreadsByThreadKey);

  useEffect(() => {
    if (workspaceKey === null) return;
    openTab(workspaceKey, scopeThreadRef(environmentId, threadId), draftId);
  }, [draftId, environmentId, openTab, threadId, workspaceKey]);

  const liveKeys = useMemo(() => {
    if (workspaceKey === null) return new Set<string>();
    const keys = new Set(
      threadShells.flatMap((thread) =>
        projectWorkspaceKey({
          environmentId: thread.environmentId,
          projectId: thread.projectId,
          worktreePath: thread.worktreePath,
        }) === workspaceKey
          ? [scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id))]
          : [],
      ),
    );
    for (const draftThread of Object.values(draftThreads)) {
      if (
        projectWorkspaceKey({
          environmentId: draftThread.environmentId,
          projectId: draftThread.projectId,
          worktreePath: draftThread.worktreePath,
        }) === workspaceKey
      ) {
        keys.add(scopedThreadKey(scopeThreadRef(draftThread.environmentId, draftThread.threadId)));
      }
    }
    return keys;
  }, [draftThreads, threadShells, workspaceKey]);

  // The route's own thread is authoritative even before its shell lands, so it
  // is never reconciled away — a freshly created thread would otherwise lose
  // its tab in the gap between navigation and the first shell projection.
  useEffect(() => {
    if (!allEnvironmentProjectSnapshotsReady || workspaceKey === null) return;
    reconcile(
      workspaceKey,
      new Set([...liveKeys, scopedThreadKey(scopeThreadRef(environmentId, threadId))]),
    );
  }, [
    allEnvironmentProjectSnapshotsReady,
    environmentId,
    liveKeys,
    reconcile,
    threadId,
    workspaceKey,
  ]);
}
