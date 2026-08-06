import type { ContextMenuItem } from "@t3tools/contracts";
import type { WorkspaceSidebarSettings } from "@t3tools/contracts/settings";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { resolveStorage } from "./lib/storage";

const WORKSPACE_SIDEBAR_STORAGE_KEY = "t3code:workspace-sidebar:v1";

export type WorkspaceContextMenuAction = "rename" | "toggle-pin" | "toggle-archive";

interface WorkspaceSidebarState {
  readonly namesByWorkspaceKey: Readonly<Record<string, string>>;
  readonly pinnedWorkspaceKeys: readonly string[];
  readonly archivedWorkspaceKeys: readonly string[];
  renameWorkspace: (workspaceKey: string, name: string) => void;
  toggleWorkspacePinned: (workspaceKey: string) => void;
  toggleWorkspaceArchived: (workspaceKey: string) => void;
  /** Adopt the labelling another device published. */
  applyRemoteSidebar: (remote: WorkspaceSidebarSettings) => void;
}

/** The whole store travels: a rename, a pin and an archive are opinions about
    the work rather than about the machine it was expressed on. */
export type SyncableWorkspaceSidebar = WorkspaceSidebarSettings;

export function selectSyncableWorkspaceSidebar(
  state: Pick<
    WorkspaceSidebarState,
    "namesByWorkspaceKey" | "pinnedWorkspaceKeys" | "archivedWorkspaceKeys"
  >,
): SyncableWorkspaceSidebar {
  return {
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
    "namesByWorkspaceKey" | "pinnedWorkspaceKeys" | "archivedWorkspaceKeys"
  >,
>(state: State, remote: SyncableWorkspaceSidebar): State {
  if (
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
  };
}

function withoutKey(keys: readonly string[], workspaceKey: string): string[] {
  return keys.filter((key) => key !== workspaceKey);
}

function toggleKey(keys: readonly string[], workspaceKey: string): string[] {
  return keys.includes(workspaceKey) ? withoutKey(keys, workspaceKey) : [...keys, workspaceKey];
}

export function buildWorkspaceContextMenuItems(input: {
  readonly isPinned: boolean;
  readonly isArchived: boolean;
}): readonly ContextMenuItem<WorkspaceContextMenuAction>[] {
  return [
    { id: "rename", label: "Rename", icon: "pencil" },
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
      }),
    },
  ),
);
