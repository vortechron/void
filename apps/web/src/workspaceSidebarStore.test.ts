import { beforeEach, describe, expect, it } from "vite-plus/test";

import {
  buildWorkspaceContextMenuItems,
  selectSyncableWorkspaceSidebar,
  useWorkspaceSidebarStore,
} from "./workspaceSidebarStore";

beforeEach(() => {
  useWorkspaceSidebarStore.setState({
    namesByWorkspaceKey: {},
    pinnedWorkspaceKeys: [],
    archivedWorkspaceKeys: [],
    syncVersion: 0,
  });
});

describe("workspace context menu", () => {
  it("contains only refresh, rename, pin, and archive actions", () => {
    expect(
      buildWorkspaceContextMenuItems({ isPinned: false, isArchived: false, staleStatusCount: 2 }),
    ).toEqual([
      { id: "refresh-status", label: "Refresh status", icon: "refresh-cw", disabled: false },
      { id: "rename", label: "Rename", icon: "pencil", separatorBefore: true },
      { id: "toggle-pin", label: "Pin", icon: "pin" },
      { id: "toggle-archive", label: "Archive", icon: "archive" },
    ]);
  });

  it("shows the reverse actions for organized workspaces", () => {
    expect(
      buildWorkspaceContextMenuItems({ isPinned: true, isArchived: true, staleStatusCount: 1 }),
    ).toEqual([
      { id: "refresh-status", label: "Refresh status", icon: "refresh-cw", disabled: false },
      { id: "rename", label: "Rename", icon: "pencil", separatorBefore: true },
      { id: "toggle-pin", label: "Unpin", icon: "pin" },
      { id: "toggle-archive", label: "Unarchive", icon: "archive" },
    ]);
  });

  it("disables the refresh when the workspace has no stale status", () => {
    const [refresh] = buildWorkspaceContextMenuItems({
      isPinned: false,
      isArchived: false,
      staleStatusCount: 0,
    });

    expect(refresh).toEqual({
      id: "refresh-status",
      label: "Refresh status",
      icon: "refresh-cw",
      disabled: true,
    });
  });
});

describe("workspace sidebar preferences", () => {
  it("stores a trimmed custom name", () => {
    useWorkspaceSidebarStore.getState().renameWorkspace("workspace-a", "  Review queue  ");

    expect(useWorkspaceSidebarStore.getState().namesByWorkspaceKey).toEqual({
      "workspace-a": "Review queue",
    });
  });

  it("pinning an archived workspace restores it", () => {
    useWorkspaceSidebarStore.setState({ archivedWorkspaceKeys: ["workspace-a"] });

    useWorkspaceSidebarStore.getState().toggleWorkspacePinned("workspace-a");

    expect(useWorkspaceSidebarStore.getState().pinnedWorkspaceKeys).toEqual(["workspace-a"]);
    expect(useWorkspaceSidebarStore.getState().archivedWorkspaceKeys).toEqual([]);
  });

  it("archiving a pinned workspace removes it from Pinned", () => {
    useWorkspaceSidebarStore.setState({ pinnedWorkspaceKeys: ["workspace-a"] });

    useWorkspaceSidebarStore.getState().toggleWorkspaceArchived("workspace-a");

    expect(useWorkspaceSidebarStore.getState().archivedWorkspaceKeys).toEqual(["workspace-a"]);
    expect(useWorkspaceSidebarStore.getState().pinnedWorkspaceKeys).toEqual([]);
  });
});

describe("cross-device workspace labelling", () => {
  it("publishes the whole labelling", () => {
    useWorkspaceSidebarStore.getState().renameWorkspace("workspace-a", "Review queue");
    useWorkspaceSidebarStore.getState().toggleWorkspacePinned("workspace-b");

    expect(selectSyncableWorkspaceSidebar(useWorkspaceSidebarStore.getState())).toEqual({
      version: 0,
      namesByWorkspaceKey: { "workspace-a": "Review queue" },
      pinnedWorkspaceKeys: ["workspace-b"],
      archivedWorkspaceKeys: [],
    });
  });

  it("adopts a rename and a pin made on another device", () => {
    useWorkspaceSidebarStore.getState().applyRemoteSidebar({
      version: 1,
      namesByWorkspaceKey: { "workspace-a": "From the phone" },
      pinnedWorkspaceKeys: ["workspace-a"],
      archivedWorkspaceKeys: [],
    });

    const state = useWorkspaceSidebarStore.getState();
    expect(state.namesByWorkspaceKey).toEqual({ "workspace-a": "From the phone" });
    expect(state.pinnedWorkspaceKeys).toEqual(["workspace-a"]);
  });

  it("applies removals, so an unpin elsewhere unpins here", () => {
    useWorkspaceSidebarStore.getState().toggleWorkspacePinned("workspace-a");
    useWorkspaceSidebarStore.getState().applyRemoteSidebar({
      version: 1,
      namesByWorkspaceKey: {},
      pinnedWorkspaceKeys: [],
      archivedWorkspaceKeys: [],
    });

    expect(useWorkspaceSidebarStore.getState().pinnedWorkspaceKeys).toEqual([]);
  });

  it("leaves the state untouched when the remote value already matches", () => {
    useWorkspaceSidebarStore.getState().renameWorkspace("workspace-a", "Same");
    const before = useWorkspaceSidebarStore.getState().namesByWorkspaceKey;

    useWorkspaceSidebarStore.getState().applyRemoteSidebar({
      version: 0,
      namesByWorkspaceKey: { "workspace-a": "Same" },
      pinnedWorkspaceKeys: [],
      archivedWorkspaceKeys: [],
    });

    expect(useWorkspaceSidebarStore.getState().namesByWorkspaceKey).toBe(before);
  });
});
