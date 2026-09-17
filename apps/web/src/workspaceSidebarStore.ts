import type { ContextMenuItem } from "@t3tools/contracts";
import type { WorkspaceSidebarSettings } from "@t3tools/contracts/settings";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { resolveStorage } from "./lib/storage";

const WORKSPACE_SIDEBAR_STORAGE_KEY = "t3code:workspace-sidebar:v1";

export type WorkspaceContextMenuAction =
  | "refresh-status"
  | "rename"
  | "toggle-pin"
  | "toggle-archive";

interface WorkspaceSidebarState {
  readonly namesByWorkspaceKey: Readonly<Record<string, string>>;
  readonly pinnedWorkspaceKeys: readonly string[];
  readonly archivedWorkspaceKeys: readonly string[];
  /** Orders this device's labelling against the other devices'. See
      `WorkspaceSyncVersion`. */
  readonly syncVersion: number;
  renameWorkspace: (workspaceKey: string, name: string) => void;
  toggleWorkspacePinned: (workspaceKey: string) => void;
  toggleWorkspaceArchived: (workspaceKey: string) => void;
  /** Adopt the labelling another device published, and its ordering. */
  applyRemoteSidebar: (remote: WorkspaceSidebarSettings) => void;
  /** Claim a version for a change made here, before publishing it. */
  stampSyncVersion: (version: number) => void;
}

/** The whole store travels: a rename, a pin and an archive are opinions about
    the work rather than about the machine it was expressed on. */
export type SyncableWorkspaceSidebar = WorkspaceSidebarSettings;

export function selectSyncableWorkspaceSidebar(
  state: Pick<
    WorkspaceSidebarState,
    "namesByWorkspaceKey" | "pinnedWorkspaceKeys" | "archivedWorkspaceKeys" | "syncVersion"
  >,
): SyncableWorkspaceSidebar {
  return {
    version: state.syncVersion,
    namesByWorkspaceKey: state.namesByWorkspaceKey,
    pinnedWorkspaceKeys: state.pinnedWorkspaceKeys,
    archivedWorkspaceKeys: state.archivedWorkspaceKeys,
  };
}

function keyListsEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((key, index) => key === right[index]);
}

function nameMapsEqual(
  left: Readonly<Record<string, string>>,
  right: Readonly<Record<string, string>>,
): boolean {
  const leftKeys = Object.keys(left);
  return (
    leftKeys.length === Object.keys(right).length &&
    leftKeys.every((key) => left[key] === right[key])
  );
}

/**
 * Converges on the remote labelling. Replacement rather than a union: an
 * unpin or an unarchive is a removal, and merging would make it impossible to
 * undo one from the other device.
 */
export function applyRemoteWorkspaceSidebar<
  State extends Pick<
    WorkspaceSidebarState,
    "namesByWorkspaceKey" | "pinnedWorkspaceKeys" | "archivedWorkspaceKeys" | "syncVersion"
  >,
>(state: State, remote: SyncableWorkspaceSidebar): State {
  if (
    state.syncVersion === remote.version &&
    nameMapsEqual(state.namesByWorkspaceKey, remote.namesByWorkspaceKey) &&
    keyListsEqual(state.pinnedWorkspaceKeys, remote.pinnedWorkspaceKeys) &&
    keyListsEqual(state.archivedWorkspaceKeys, remote.archivedWorkspaceKeys)
  ) {
    return state;
  }
  return {
    ...state,
    namesByWorkspaceKey: { ...remote.namesByWorkspaceKey },
    pinnedWorkspaceKeys: [...remote.pinnedWorkspaceKeys],
    archivedWorkspaceKeys: [...remote.archivedWorkspaceKeys],
    syncVersion: remote.version,
  };
}

function withoutKey(keys: readonly string[], workspaceKey: string): string[] {
  return keys.filter((key) => key !== workspaceKey);
}

function toggleKey(keys: readonly string[], workspaceKey: string): string[] {
  return keys.includes(workspaceKey) ? withoutKey(keys, workspaceKey) : [...keys, workspaceKey];
}

/**
 * `staleStatusCount` is how many chats in this workspace still show a status
 * the user can no longer clear from the chat itself — see
 * `planWorkspaceStatusRefresh`. Zero disables the action rather than hiding it,
 * so the row's menu keeps a stable shape.
 */
export function buildWorkspaceContextMenuItems(input: {
  readonly isPinned: boolean;
  readonly isArchived: boolean;
  readonly staleStatusCount: number;
}): readonly ContextMenuItem<WorkspaceContextMenuAction>[] {
  return [
    {
      id: "refresh-status",
      label: "Refresh status",
      icon: "refresh-cw",
      disabled: input.staleStatusCount === 0,
    },
    { id: "rename", label: "Rename", icon: "pencil", separatorBefore: true },
    {
      id: "toggle-pin",
      label: input.isPinned ? "Unpin" : "Pin",
      icon: "pin",
    },
    {
      id: "toggle-archive",
      label: input.isArchived ? "Unarchive" : "Archive",
      icon: "archive",
    },
  ];
}

export const useWorkspaceSidebarStore = create<WorkspaceSidebarState>()(
  persist(
    (set) => ({
      namesByWorkspaceKey: {},
      pinnedWorkspaceKeys: [],
      archivedWorkspaceKeys: [],
      syncVersion: 0,
      renameWorkspace: (workspaceKey, name) => {
        const trimmedName = name.trim();
        if (!trimmedName) return;
        set((state) => ({
          namesByWorkspaceKey: {
            ...state.namesByWorkspaceKey,
            [workspaceKey]: trimmedName,
          },
        }));
      },
      toggleWorkspacePinned: (workspaceKey) =>
        set((state) => {
          const wasPinned = state.pinnedWorkspaceKeys.includes(workspaceKey);
          return {
            pinnedWorkspaceKeys: toggleKey(state.pinnedWorkspaceKeys, workspaceKey),
            archivedWorkspaceKeys: wasPinned
              ? state.archivedWorkspaceKeys
              : withoutKey(state.archivedWorkspaceKeys, workspaceKey),
          };
        }),
      toggleWorkspaceArchived: (workspaceKey) =>
        set((state) => {
          const wasArchived = state.archivedWorkspaceKeys.includes(workspaceKey);
          return {
            archivedWorkspaceKeys: toggleKey(state.archivedWorkspaceKeys, workspaceKey),
            pinnedWorkspaceKeys: wasArchived
              ? state.pinnedWorkspaceKeys
              : withoutKey(state.pinnedWorkspaceKeys, workspaceKey),
          };
        }),
      applyRemoteSidebar: (remote) => set((state) => applyRemoteWorkspaceSidebar(state, remote)),
      stampSyncVersion: (version) =>
        set((state) => (state.syncVersion === version ? state : { syncVersion: version })),
    }),
    {
      name: WORKSPACE_SIDEBAR_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() =>
        resolveStorage(typeof window !== "undefined" ? window.localStorage : undefined),
      ),
      partialize: (state) => ({
        namesByWorkspaceKey: state.namesByWorkspaceKey,
        pinnedWorkspaceKeys: state.pinnedWorkspaceKeys,
        archivedWorkspaceKeys: state.archivedWorkspaceKeys,
        syncVersion: state.syncVersion,
      }),
    },
  ),
);
