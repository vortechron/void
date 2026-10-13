/** Whether each sidebar workspace row lists its open chat tabs. */
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { resolveStorage } from "./lib/storage";

const WORKSPACE_TAB_LIST_STORAGE_KEY = "t3code:workspace-tab-lists:v1";

interface WorkspaceTabListState {
  /**
   * Only rows the user has toggled. View state for this screen, so it stays on
   * this device rather than travelling with the open tabs themselves.
   */
  readonly expandedByWorkspaceKey: Readonly<Record<string, boolean>>;
  setTabListExpanded: (workspaceKey: string, expanded: boolean) => void;
}

/**
 * An untouched row lists its tabs only while it is the workspace you are in,
 * so the sidebar shows where you are without unrolling every checkout. Once
 * toggled, a row keeps the user's choice.
 */
export function resolveWorkspaceTabListExpanded(
  override: boolean | undefined,
  isActiveWorkspace: boolean,
): boolean {
  return override ?? isActiveWorkspace;
}

export const useWorkspaceTabListStore = create<WorkspaceTabListState>()(
  persist(
    (set) => ({
      expandedByWorkspaceKey: {},
      setTabListExpanded: (workspaceKey, expanded) =>
        set((state) =>
          state.expandedByWorkspaceKey[workspaceKey] === expanded
            ? state
            : {
                expandedByWorkspaceKey: {
                  ...state.expandedByWorkspaceKey,
                  [workspaceKey]: expanded,
                },
              },
        ),
    }),
    {
      name: WORKSPACE_TAB_LIST_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() =>
        resolveStorage(typeof window !== "undefined" ? window.localStorage : undefined),
      ),
      partialize: (state) => ({ expandedByWorkspaceKey: state.expandedByWorkspaceKey }),
    },
  ),
);
