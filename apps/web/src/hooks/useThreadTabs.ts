import { scopeThreadRef, scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { useEffect, useMemo } from "react";

import { useComposerDraftStore, type DraftId } from "../composerDraftStore";
import { useAllEnvironmentShellsBootstrapped, useThreadShells } from "../state/entities";
import { useThreadTabsStore } from "../threadTabsStore";
import { projectWorkspaceKey } from "../workspaceSessions";

/**
 * Keeps the tab strip in agreement with the route and with the threads that
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
  const allEnvironmentShellsBootstrapped = useAllEnvironmentShellsBootstrapped();
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
    if (!allEnvironmentShellsBootstrapped || workspaceKey === null) return;
    reconcile(
      workspaceKey,
      new Set([...liveKeys, scopedThreadKey(scopeThreadRef(environmentId, threadId))]),
    );
  }, [
    allEnvironmentShellsBootstrapped,
    environmentId,
    liveKeys,
    reconcile,
    threadId,
    workspaceKey,
  ]);
}
