import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { DraftId } from "./composerDraftStore";
import {
  EMPTY_THREAD_TABS_STATE,
  EMPTY_WORKSPACE_THREAD_TABS_STATE,
  addThreadTabToGroup,
  applyRemoteWorkspaceThreadTabs,
  closeOtherThreadTabs,
  closeThreadTab,
  closeThreadTabsToRight,
  createThreadTabGroup,
  findRemotelyClosedActiveTab,
  migratePersistedThreadTabs,
  moveThreadTab,
  openThreadTab,
  openWorkspaceThreadTab,
  reconcileThreadTabs,
  removeThreadTabFromGroup,
  resolveThreadTabCloseFollow,
  selectSyncableWorkspaceThreadTabs,
  threadTabKey,
  toggleThreadTabGroup,
  ungroupThreadTabs,
  updateThreadTabGroup,
  type ThreadTabsState,
} from "./threadTabsStore";

const ENV = EnvironmentId.make("env-1");
const ref = (id: string) => scopeThreadRef(ENV, ThreadId.make(id));
const key = (id: string) => threadTabKey(ref(id));

function openAll(ids: readonly string[]): ThreadTabsState {
  return ids.reduce(
    (state, id) => openThreadTab(state, ref(id), null),
    EMPTY_THREAD_TABS_STATE as ThreadTabsState,
  );
}

describe("openThreadTab", () => {
  it("appends new threads and activates them", () => {
    const state = openAll(["a", "b"]);
    expect(state.tabs.map((tab) => tab.threadId)).toEqual(["a", "b"]);
    expect(state.activeKey).toBe(key("b"));
  });

  it("activates an already-open thread without reordering the strip", () => {
    const state = openThreadTab(openAll(["a", "b", "c"]), ref("a"), null);
    expect(state.tabs.map((tab) => tab.threadId)).toEqual(["a", "b", "c"]);
    expect(state.activeKey).toBe(key("a"));
  });

  it("clears the draft binding once the draft is promoted", () => {
    const draft = openThreadTab(EMPTY_THREAD_TABS_STATE, ref("a"), DraftId.make("draft-1"));
    expect(draft.tabs[0]?.draftId).toBe("draft-1");
    const promoted = openThreadTab(draft, ref("a"), null);
    expect(promoted.tabs).toHaveLength(1);
    expect(promoted.tabs[0]?.draftId).toBeNull();
  });

  it("keeps every tab open until it is closed", () => {
    const ids = Array.from({ length: 40 }, (_, index) => `t${index}`);
    const many = openThreadTab(openAll(ids), ref("latest"), null);
    expect(many.tabs.map((tab) => tab.threadId)).toEqual([...ids, "latest"]);
    expect(many.activeKey).toBe(key("latest"));
  });
});

describe("closeThreadTab", () => {
  it("moves focus to the tab on the right", () => {
    const state = closeThreadTab({ ...openAll(["a", "b", "c"]), activeKey: key("b") }, key("b"));
    expect(state.tabs.map((tab) => tab.threadId)).toEqual(["a", "c"]);
    expect(state.activeKey).toBe(key("c"));
  });

  it("falls back to the tab on the left when the last tab closes", () => {
    const state = closeThreadTab(openAll(["a", "b"]), key("b"));
    expect(state.activeKey).toBe(key("a"));
  });

  it("leaves focus alone when closing an inactive tab", () => {
    const state = closeThreadTab({ ...openAll(["a", "b", "c"]), activeKey: key("a") }, key("c"));
    expect(state.activeKey).toBe(key("a"));
  });

  it("empties the strip when the only tab closes", () => {
    expect(closeThreadTab(openAll(["a"]), key("a"))).toEqual({
      tabs: [],
      activeKey: null,
      groups: [],
    });
  });
});

describe("bulk closes", () => {
  it("keeps only the target tab", () => {
    const state = closeOtherThreadTabs(openAll(["a", "b", "c"]), key("b"));
    expect(state.tabs.map((tab) => tab.threadId)).toEqual(["b"]);
    expect(state.activeKey).toBe(key("b"));
  });

  it("trims tabs to the right and rescues a dropped active tab", () => {
    const state = closeThreadTabsToRight(openAll(["a", "b", "c"]), key("a"));
    expect(state.tabs.map((tab) => tab.threadId)).toEqual(["a"]);
    expect(state.activeKey).toBe(key("a"));
  });

  it("keeps the active tab when it survives a right-trim", () => {
    const state = closeThreadTabsToRight(
      { ...openAll(["a", "b", "c"]), activeKey: key("a") },
      key("b"),
    );
    expect(state.activeKey).toBe(key("a"));
  });
});

describe("moveThreadTab", () => {
  it("reorders without changing which tab is active", () => {
    const state = moveThreadTab({ ...openAll(["a", "b", "c"]), activeKey: key("a") }, key("c"), 0);
    expect(state.tabs.map((tab) => tab.threadId)).toEqual(["c", "a", "b"]);
    expect(state.activeKey).toBe(key("a"));
  });

  it("clamps an out-of-range destination to the end", () => {
    const state = moveThreadTab(openAll(["a", "b", "c"]), key("a"), 99);
    expect(state.tabs.map((tab) => tab.threadId)).toEqual(["b", "c", "a"]);
  });
});

describe("thread tab groups", () => {
  const GROUP = { id: "group-1", name: "Research", color: "blue" as const };

  it("creates a named group around one tab", () => {
    const state = createThreadTabGroup(openAll(["a", "b"]), key("a"), GROUP);

    expect(state.groups).toEqual([{ ...GROUP, collapsed: false }]);
    expect(state.tabs.map((tab) => [tab.threadId, tab.groupId])).toEqual([
      ["a", GROUP.id],
      ["b", null],
    ]);
  });

  it("moves another tab beside the group members", () => {
    const grouped = createThreadTabGroup(openAll(["a", "b", "c"]), key("a"), GROUP);
    const state = addThreadTabToGroup(grouped, key("c"), GROUP.id);

    expect(state.tabs.map((tab) => [tab.threadId, tab.groupId])).toEqual([
      ["a", GROUP.id],
      ["c", GROUP.id],
      ["b", null],
    ]);
  });

  it("removes a tab without splitting the remaining group", () => {
    const withA = createThreadTabGroup(openAll(["a", "b", "c"]), key("a"), GROUP);
    const grouped = addThreadTabToGroup(
      addThreadTabToGroup(withA, key("b"), GROUP.id),
      key("c"),
      GROUP.id,
    );
    const state = removeThreadTabFromGroup(grouped, key("b"));

    expect(state.tabs.map((tab) => [tab.threadId, tab.groupId])).toEqual([
      ["a", GROUP.id],
      ["c", GROUP.id],
      ["b", null],
    ]);
  });

  it("collapses and expands the group without changing the active tab", () => {
    const grouped = createThreadTabGroup(openAll(["a", "b"]), key("a"), GROUP);
    const collapsed = toggleThreadTabGroup(grouped, GROUP.id);
    const expanded = toggleThreadTabGroup(collapsed, GROUP.id);

    expect(collapsed.groups[0]?.collapsed).toBe(true);
    expect(collapsed.activeKey).toBe(grouped.activeKey);
    expect(expanded.groups[0]?.collapsed).toBe(false);
  });

  it("expands a collapsed group when one of its tabs opens from another entry point", () => {
    const grouped = createThreadTabGroup(openAll(["a", "b"]), key("a"), GROUP);
    const collapsed = toggleThreadTabGroup(grouped, GROUP.id);
    const reopened = openThreadTab(collapsed, ref("a"), null);

    expect(reopened.groups[0]?.collapsed).toBe(false);
    expect(reopened.activeKey).toBe(key("a"));
  });

  it("renames and recolors a group", () => {
    const grouped = createThreadTabGroup(openAll(["a", "b"]), key("a"), GROUP);
    const state = updateThreadTabGroup(grouped, GROUP.id, {
      name: "  Build  ",
      color: "green",
    });

    expect(state.groups[0]).toMatchObject({ name: "Build", color: "green" });
  });

  it("lets an ungrouped tab join a group when dragged between its tabs", () => {
    const withA = createThreadTabGroup(openAll(["a", "b", "c"]), key("a"), GROUP);
    const grouped = addThreadTabToGroup(withA, key("c"), GROUP.id);
    const state = moveThreadTab(grouped, key("b"), 1);

    expect(state.tabs.map((tab) => [tab.threadId, tab.groupId])).toEqual([
      ["a", GROUP.id],
      ["b", GROUP.id],
      ["c", GROUP.id],
    ]);
  });

  it("drops an empty group when its final tab closes", () => {
    const grouped = createThreadTabGroup(openAll(["a", "b"]), key("a"), GROUP);
    const state = closeThreadTab(grouped, key("a"));

    expect(state.groups).toEqual([]);
  });

  it("ungroups every tab while keeping their order", () => {
    const withA = createThreadTabGroup(openAll(["a", "b", "c"]), key("a"), GROUP);
    const grouped = addThreadTabToGroup(withA, key("b"), GROUP.id);
    const state = ungroupThreadTabs(grouped, GROUP.id);

    expect(state.groups).toEqual([]);
    expect(state.tabs.map((tab) => [tab.threadId, tab.groupId])).toEqual([
      ["a", null],
      ["b", null],
      ["c", null],
    ]);
  });
});

describe("reconcileThreadTabs", () => {
  it("drops tabs whose thread is gone", () => {
    const state = reconcileThreadTabs(openAll(["a", "b"]), new Set([key("a")]));
    expect(state.tabs.map((tab) => tab.threadId)).toEqual(["a"]);
    expect(state.activeKey).toBe(key("a"));
  });

  it("keeps the active tab untouched when it survives", () => {
    const state = reconcileThreadTabs(
      { ...openAll(["a", "b", "c"]), activeKey: key("a") },
      new Set([key("a"), key("c")]),
    );
    expect(state.activeKey).toBe(key("a"));
  });

  it("returns the same state when nothing is stale", () => {
    const open = openAll(["a", "b"]);
    expect(reconcileThreadTabs(open, new Set([key("a"), key("b")]))).toBe(open);
  });
});

describe("migratePersistedThreadTabs", () => {
  it("rebuilds keys and drops malformed entries", () => {
    const state = migratePersistedThreadTabs({
      byWorkspaceKey: {
        main: {
          tabs: [
            { environmentId: "env-1", threadId: "a", draftId: null },
            { environmentId: "env-1", threadId: "a", draftId: null },
            { environmentId: "env-1" },
            null,
          ],
          activeKey: key("a"),
        },
      },
    });
    expect(state.byWorkspaceKey.main?.tabs.map((tab) => tab.key)).toEqual([key("a")]);
    expect(state.byWorkspaceKey.main?.activeKey).toBe(key("a"));
  });

  it("falls back to the last tab when the stored active key is stale", () => {
    const state = migratePersistedThreadTabs({
      byWorkspaceKey: {
        feature: {
          tabs: [{ environmentId: "env-1", threadId: "a" }],
          activeKey: key("missing"),
        },
      },
    });
    expect(state.byWorkspaceKey.feature?.activeKey).toBe(key("a"));
  });

  it("keeps each workspace's tab strip isolated", () => {
    const state = migratePersistedThreadTabs({
      byWorkspaceKey: {
        main: { tabs: [{ environmentId: "env-1", threadId: "a" }], activeKey: key("a") },
        feature: {
          tabs: [{ environmentId: "env-1", threadId: "b" }],
          activeKey: key("b"),
        },
      },
    });

    expect(state.byWorkspaceKey.main?.tabs.map((tab) => tab.threadId)).toEqual(["a"]);
    expect(state.byWorkspaceKey.feature?.tabs.map((tab) => tab.threadId)).toEqual(["b"]);
  });

  it("restores valid groups and drops broken group links", () => {
    const state = migratePersistedThreadTabs({
      byWorkspaceKey: {
        main: {
          tabs: [
            { environmentId: "env-1", threadId: "a", groupId: "group-1" },
            { environmentId: "env-1", threadId: "b", groupId: "missing" },
          ],
          activeKey: key("a"),
          groups: [
            { id: "group-1", name: " Research ", color: "blue", collapsed: true },
            { id: "bad-color", name: "Bad", color: "orange", collapsed: false },
          ],
        },
      },
    });

    expect(state.byWorkspaceKey.main?.groups).toEqual([
      { id: "group-1", name: "Research", color: "blue", collapsed: true },
    ]);
    expect(state.byWorkspaceKey.main?.tabs.map((tab) => tab.groupId)).toEqual(["group-1", null]);
  });

  it("tolerates junk", () => {
    expect(migratePersistedThreadTabs(null)).toEqual(EMPTY_WORKSPACE_THREAD_TABS_STATE);
    expect(migratePersistedThreadTabs({})).toEqual(EMPTY_WORKSPACE_THREAD_TABS_STATE);
  });
});

describe("openWorkspaceThreadTab", () => {
  const BASE = "base-workspace";
  const WORKTREE = "worktree-workspace";

  it("moves a chat out of its old checkout when it lands in a new one", () => {
    const inBase = openWorkspaceThreadTab(
      EMPTY_WORKSPACE_THREAD_TABS_STATE,
      BASE,
      ref("a"),
      DraftId.make("draft-1"),
    );
    expect(inBase.activeWorkspaceKey).toBe(BASE);

    const promoted = openWorkspaceThreadTab(inBase, WORKTREE, ref("a"), null);
    expect(promoted.activeWorkspaceKey).toBe(WORKTREE);
    expect(promoted.byWorkspaceKey[WORKTREE]?.tabs.map((tab) => tab.threadId)).toEqual(["a"]);
    expect(promoted.byWorkspaceKey[BASE]?.tabs).toEqual([]);
    expect(promoted.byWorkspaceKey[BASE]?.activeKey).toBeNull();
  });

  it("leaves the other checkouts' own tabs alone", () => {
    const seeded = openWorkspaceThreadTab(
      openWorkspaceThreadTab(EMPTY_WORKSPACE_THREAD_TABS_STATE, BASE, ref("a"), null),
      BASE,
      ref("b"),
      null,
    );

    const moved = openWorkspaceThreadTab(seeded, WORKTREE, ref("b"), null);
    expect(moved.byWorkspaceKey[BASE]?.tabs.map((tab) => tab.threadId)).toEqual(["a"]);
    expect(moved.byWorkspaceKey[BASE]?.activeKey).toBe(key("a"));
  });

  it("returns the same state when the tab is already open and active", () => {
    const seeded = openWorkspaceThreadTab(EMPTY_WORKSPACE_THREAD_TABS_STATE, BASE, ref("a"), null);
    expect(openWorkspaceThreadTab(seeded, BASE, ref("a"), null)).toBe(seeded);
  });
});

describe("cross-device tab sync", () => {
  const BASE = "base-workspace";

  it("publishes only real chats, and only workspaces that have one", () => {
    const withDraft = openWorkspaceThreadTab(
      openWorkspaceThreadTab(EMPTY_WORKSPACE_THREAD_TABS_STATE, BASE, ref("a"), null),
      BASE,
      ref("draft-thread"),
      DraftId.make("draft-1"),
    );
    const draftsOnly = openWorkspaceThreadTab(
      withDraft,
      "empty-workspace",
      ref("draft-thread-2"),
      DraftId.make("draft-2"),
    );

    expect(selectSyncableWorkspaceThreadTabs(draftsOnly)).toEqual({
      version: 0,
      byWorkspaceKey: { [BASE]: [{ environmentId: ENV, threadId: "a", groupId: null }] },
      groupsByWorkspaceKey: {},
    });
  });

  it("syncs group membership and appearance while collapse stays local", () => {
    const opened = openWorkspaceThreadTab(
      openWorkspaceThreadTab(EMPTY_WORKSPACE_THREAD_TABS_STATE, BASE, ref("a"), null),
      BASE,
      ref("b"),
      null,
    );
    const grouped = createThreadTabGroup(opened.byWorkspaceKey[BASE]!, key("a"), {
      id: "group-1",
      name: "Research",
      color: "blue",
    });
    const collapsed = toggleThreadTabGroup(grouped, "group-1");
    const local = {
      ...opened,
      byWorkspaceKey: { ...opened.byWorkspaceKey, [BASE]: collapsed },
    };

    const published = selectSyncableWorkspaceThreadTabs(local);
    expect(published.byWorkspaceKey[BASE]?.[0]?.groupId).toBe("group-1");
    expect(published.groupsByWorkspaceKey[BASE]).toEqual([
      { id: "group-1", name: "Research", color: "blue" },
    ]);

    const applied = applyRemoteWorkspaceThreadTabs(EMPTY_WORKSPACE_THREAD_TABS_STATE, published);
    expect(applied.byWorkspaceKey[BASE]?.tabs[0]?.groupId).toBe("group-1");
    expect(applied.byWorkspaceKey[BASE]?.groups).toEqual([
      { id: "group-1", name: "Research", color: "blue", collapsed: false },
    ]);
  });

  it("applies remote group edits without changing this device's collapsed state", () => {
    const opened = openWorkspaceThreadTab(EMPTY_WORKSPACE_THREAD_TABS_STATE, BASE, ref("a"), null);
    const grouped = toggleThreadTabGroup(
      createThreadTabGroup(opened.byWorkspaceKey[BASE]!, key("a"), {
        id: "group-1",
        name: "Research",
        color: "blue",
      }),
      "group-1",
    );
    const local = { ...opened, byWorkspaceKey: { [BASE]: grouped } };

    const applied = applyRemoteWorkspaceThreadTabs(local, {
      version: 2,
      byWorkspaceKey: {
        [BASE]: [{ environmentId: ENV, threadId: "a", groupId: "group-1" }],
      },
      groupsByWorkspaceKey: {
        [BASE]: [{ id: "group-1", name: "Build", color: "green" }],
      },
    });

    expect(applied.byWorkspaceKey[BASE]?.groups).toEqual([
      { id: "group-1", name: "Build", color: "green", collapsed: true },
    ]);
  });

  it("opens a chat another device started", () => {
    const applied = applyRemoteWorkspaceThreadTabs(EMPTY_WORKSPACE_THREAD_TABS_STATE, {
      version: 1,
      byWorkspaceKey: { [BASE]: [{ environmentId: ENV, threadId: "remote", groupId: null }] },
      groupsByWorkspaceKey: {},
    });

    expect(applied.byWorkspaceKey[BASE]?.tabs.map((tab) => tab.threadId)).toEqual(["remote"]);
    expect(applied.byWorkspaceKey[BASE]?.activeKey).toBe(key("remote"));
  });

  it("closes a chat another device closed, and keeps the local draft", () => {
    const seeded = openWorkspaceThreadTab(
      openWorkspaceThreadTab(EMPTY_WORKSPACE_THREAD_TABS_STATE, BASE, ref("a"), null),
      BASE,
      ref("draft-thread"),
      DraftId.make("draft-1"),
    );

    const applied = applyRemoteWorkspaceThreadTabs(seeded, {
      version: 1,
      byWorkspaceKey: { [BASE]: [] },
      groupsByWorkspaceKey: {},
    });

    expect(applied.byWorkspaceKey[BASE]?.tabs.map((tab) => tab.threadId)).toEqual(["draft-thread"]);
  });

  it("keeps the active tab when it survives the remote set", () => {
    const seeded = openWorkspaceThreadTab(
      openWorkspaceThreadTab(EMPTY_WORKSPACE_THREAD_TABS_STATE, BASE, ref("a"), null),
      BASE,
      ref("b"),
      null,
    );

    const applied = applyRemoteWorkspaceThreadTabs(seeded, {
      version: 1,
      byWorkspaceKey: {
        [BASE]: [
          { environmentId: ENV, threadId: "a", groupId: null },
          { environmentId: ENV, threadId: "b", groupId: null },
          { environmentId: ENV, threadId: "c", groupId: null },
        ],
      },
      groupsByWorkspaceKey: {},
    });

    expect(applied.byWorkspaceKey[BASE]?.activeKey).toBe(key("b"));
    expect(applied.byWorkspaceKey[BASE]?.tabs.map((tab) => tab.threadId)).toEqual(["a", "b", "c"]);
  });

  it("does not restore a tab another device closed while it was active here", () => {
    const openedOnBothDevices = openWorkspaceThreadTab(
      openWorkspaceThreadTab(EMPTY_WORKSPACE_THREAD_TABS_STATE, BASE, ref("a"), null),
      BASE,
      ref("b"),
      null,
    );
    const closedOnTablet = {
      ...openedOnBothDevices,
      byWorkspaceKey: {
        ...openedOnBothDevices.byWorkspaceKey,
        [BASE]: closeThreadTab(openedOnBothDevices.byWorkspaceKey[BASE]!, key("b")),
      },
      syncVersion: 1,
    };
    const publishedClose = selectSyncableWorkspaceThreadTabs(closedOnTablet);

    const appliedOnMac = applyRemoteWorkspaceThreadTabs(openedOnBothDevices, publishedClose);

    expect(appliedOnMac.byWorkspaceKey[BASE]?.tabs.map((tab) => tab.threadId)).toEqual(["a"]);
    expect(appliedOnMac.byWorkspaceKey[BASE]?.activeKey).toBe(key("a"));
    expect(selectSyncableWorkspaceThreadTabs(appliedOnMac)).toEqual(publishedClose);
  });

  it("keeps tab identity so unchanged rows do not re-render", () => {
    const seeded = openWorkspaceThreadTab(EMPTY_WORKSPACE_THREAD_TABS_STATE, BASE, ref("a"), null);
    const applied = applyRemoteWorkspaceThreadTabs(seeded, {
      version: 0,
      byWorkspaceKey: { [BASE]: [{ environmentId: ENV, threadId: "a", groupId: null }] },
      groupsByWorkspaceKey: {},
    });

    expect(applied).toBe(seeded);
  });

  it("ignores a remote workspace this device has nothing open in", () => {
    const applied = applyRemoteWorkspaceThreadTabs(EMPTY_WORKSPACE_THREAD_TABS_STATE, {
      version: 0,
      byWorkspaceKey: { "unknown-workspace": [] },
      groupsByWorkspaceKey: {},
    });

    expect(applied).toBe(EMPTY_WORKSPACE_THREAD_TABS_STATE);
  });

  it("adopts the remote ordering so the next local change outranks it", () => {
    const applied = applyRemoteWorkspaceThreadTabs(EMPTY_WORKSPACE_THREAD_TABS_STATE, {
      version: 7,
      byWorkspaceKey: { [BASE]: [{ environmentId: ENV, threadId: "remote", groupId: null }] },
      groupsByWorkspaceKey: {},
    });

    expect(applied.syncVersion).toBe(7);
  });

  it("round-trips: what one device publishes is what the other opens", () => {
    const seeded = openWorkspaceThreadTab(
      openWorkspaceThreadTab(EMPTY_WORKSPACE_THREAD_TABS_STATE, BASE, ref("a"), null),
      BASE,
      ref("b"),
      null,
    );

    const applied = applyRemoteWorkspaceThreadTabs(
      EMPTY_WORKSPACE_THREAD_TABS_STATE,
      selectSyncableWorkspaceThreadTabs(seeded),
    );

    expect(selectSyncableWorkspaceThreadTabs(applied).byWorkspaceKey).toEqual(
      selectSyncableWorkspaceThreadTabs(seeded).byWorkspaceKey,
    );
  });
});

describe("remote close of the chat on screen", () => {
  const BASE = "workspace-base";
  const showingB = openWorkspaceThreadTab(
    openWorkspaceThreadTab(EMPTY_WORKSPACE_THREAD_TABS_STATE, BASE, ref("a"), null),
    BASE,
    ref("b"),
    null,
  );
  const remoteOpenSet = (ids: readonly string[]) => ({
    version: 1,
    byWorkspaceKey: {
      [BASE]: ids.map((id) => ({ environmentId: ENV, threadId: id, groupId: null })),
    },
    groupsByWorkspaceKey: {},
  });

  it("reports the chat this device was showing when another device closes it", () => {
    const applied = applyRemoteWorkspaceThreadTabs(showingB, remoteOpenSet(["a"]));

    expect(findRemotelyClosedActiveTab(showingB, applied)).toEqual({
      workspaceKey: BASE,
      key: key("b"),
    });
  });

  it("reports nothing when another device closes a chat this device is not showing", () => {
    const applied = applyRemoteWorkspaceThreadTabs(showingB, remoteOpenSet(["b"]));

    expect(findRemotelyClosedActiveTab(showingB, applied)).toBeNull();
  });
});

describe("resolveThreadTabCloseFollow", () => {
  const before = { ...openAll(["a", "b", "c"]), activeKey: key("b") };

  it("stays put when the chat on screen is still open", () => {
    const after = closeThreadTab(before, key("a"));

    expect(resolveThreadTabCloseFollow({ routeThreadKey: key("b"), before, after })).toEqual({
      kind: "stay",
    });
  });

  it("stays put when the chat on screen belongs to another workspace", () => {
    const after = closeThreadTab(before, key("b"));

    expect(resolveThreadTabCloseFollow({ routeThreadKey: key("z"), before, after })).toEqual({
      kind: "stay",
    });
    expect(resolveThreadTabCloseFollow({ routeThreadKey: null, before, after })).toEqual({
      kind: "stay",
    });
  });

  it("opens the tab that took over when the chat on screen closes", () => {
    const after = closeThreadTab(before, key("b"));
    const follow = resolveThreadTabCloseFollow({ routeThreadKey: key("b"), before, after });

    expect(follow.kind === "open" ? follow.tab.key : null).toBe(key("c"));
  });

  it("opens the kept tab when closing the others takes the chat on screen away", () => {
    const after = closeOtherThreadTabs(before, key("a"));
    const follow = resolveThreadTabCloseFollow({ routeThreadKey: key("b"), before, after });

    expect(follow.kind === "open" ? follow.tab.key : null).toBe(key("a"));
  });

  it("starts a new chat when nothing is left open in the workspace", () => {
    expect(
      resolveThreadTabCloseFollow({
        routeThreadKey: key("b"),
        before,
        after: EMPTY_THREAD_TABS_STATE,
      }),
    ).toEqual({ kind: "new" });
  });
});
