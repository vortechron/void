import type { ContextMenuItem } from "@t3tools/contracts";
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
