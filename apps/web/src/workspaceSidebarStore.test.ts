import { beforeEach, describe, expect, it } from "vite-plus/test";

import { buildWorkspaceContextMenuItems, useWorkspaceSidebarStore } from "./workspaceSidebarStore";

beforeEach(() => {
  useWorkspaceSidebarStore.setState({
    namesByWorkspaceKey: {},
    pinnedWorkspaceKeys: [],
    archivedWorkspaceKeys: [],
  });
});

describe("workspace context menu", () => {
  it("contains only rename, pin, and archive actions", () => {
    expect(buildWorkspaceContextMenuItems({ isPinned: false, isArchived: false })).toEqual([
      { id: "rename", label: "Rename", icon: "pencil" },
      { id: "toggle-pin", label: "Pin", icon: "pin" },
      { id: "toggle-archive", label: "Archive", icon: "archive" },
    ]);
  });

  it("shows the reverse actions for organized workspaces", () => {
    expect(buildWorkspaceContextMenuItems({ isPinned: true, isArchived: true })).toEqual([
      { id: "rename", label: "Rename", icon: "pencil" },
      { id: "toggle-pin", label: "Unpin", icon: "pin" },
      { id: "toggle-archive", label: "Unarchive", icon: "archive" },
    ]);
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
