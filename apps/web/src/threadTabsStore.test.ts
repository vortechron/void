import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { DraftId } from "./composerDraftStore";
import {
  EMPTY_THREAD_TABS_STATE,
  EMPTY_WORKSPACE_THREAD_TABS_STATE,
  MAX_THREAD_TABS,
  closeOtherThreadTabs,
  closeThreadTab,
  closeThreadTabsToRight,
  migratePersistedThreadTabs,
  moveThreadTab,
  openThreadTab,
  reconcileThreadTabs,
  threadTabKey,
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

  it("evicts the oldest inactive tab past the limit", () => {
    const ids = Array.from({ length: MAX_THREAD_TABS }, (_, index) => `t${index}`);
    const full = openAll(ids);
    expect(full.tabs).toHaveLength(MAX_THREAD_TABS);

    const overflowed = openThreadTab(full, ref("overflow"), null);
    expect(overflowed.tabs).toHaveLength(MAX_THREAD_TABS);
    expect(overflowed.tabs.map((tab) => tab.threadId)).not.toContain("t0");
    expect(overflowed.activeKey).toBe(key("overflow"));
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
    expect(closeThreadTab(openAll(["a"]), key("a"))).toEqual({ tabs: [], activeKey: null });
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

  it("tolerates junk", () => {
    expect(migratePersistedThreadTabs(null)).toEqual(EMPTY_WORKSPACE_THREAD_TABS_STATE);
    expect(migratePersistedThreadTabs({})).toEqual(EMPTY_WORKSPACE_THREAD_TABS_STATE);
  });
});
