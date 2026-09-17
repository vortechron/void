/** Workspace-scoped chat tabs for the Conductor-style workspace header. */
import { scopeThreadRef, scopedThreadKey } from "@t3tools/client-runtime/environment";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import type { ScopedThreadRef } from "@t3tools/contracts";
import type { WorkspaceThreadTab, WorkspaceThreadTabsSettings } from "@t3tools/contracts/settings";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { DraftId } from "./composerDraftStore";
import { resolveStorage } from "./lib/storage";

const THREAD_TABS_STORAGE_KEY = "t3code:workspace-thread-tabs:v2";
const THREAD_TABS_STORAGE_VERSION = 2;

/** Beyond this the strip is unreadable, so the oldest inactive tab drops off. */
export const MAX_THREAD_TABS = 12;

export interface ThreadTab {
  readonly key: string;
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly draftId: DraftId | null;
}

export interface ThreadTabsState {
  readonly tabs: readonly ThreadTab[];
  readonly activeKey: string | null;
}

export interface WorkspaceThreadTabsState {
  readonly byWorkspaceKey: Readonly<Record<string, ThreadTabsState>>;
  readonly activeWorkspaceKey: string | null;
  /**
   * Orders this device's open set against the other devices'. Bumped past
   * every version seen whenever the tabs change here, so "I just closed
   * everything" always outranks an older set — see `WorkspaceSyncVersion`.
   * Persisted, because the ordering has to survive a reload.
   */
  readonly syncVersion: number;
}

export const EMPTY_THREAD_TABS_STATE: ThreadTabsState = { tabs: [], activeKey: null };
export const EMPTY_WORKSPACE_THREAD_TABS_STATE: WorkspaceThreadTabsState = {
  byWorkspaceKey: {},
  activeWorkspaceKey: null,
  syncVersion: 0,
};

export function threadTabKey(ref: ScopedThreadRef): string {
  return scopedThreadKey(ref);
}

export function threadTabRef(tab: ThreadTab): ScopedThreadRef {
  return { environmentId: tab.environmentId, threadId: tab.threadId };
}

export function openThreadTab(
  state: ThreadTabsState,
  ref: ScopedThreadRef,
  draftId: DraftId | null,
): ThreadTabsState {
  const key = threadTabKey(ref);
  const existing = state.tabs.find((tab) => tab.key === key);
  if (existing) {
    const tabs =
      existing.draftId === draftId
        ? state.tabs
        : state.tabs.map((tab) => (tab.key === key ? { ...tab, draftId } : tab));
    if (tabs === state.tabs && state.activeKey === key) return state;
    return { tabs, activeKey: key };
  }

  const tab: ThreadTab = {
    key,
    environmentId: ref.environmentId,
    threadId: ref.threadId,
    draftId,
  };
  const appended = [...state.tabs, tab];
  return { tabs: trimToLimit(appended, key), activeKey: key };
}

function trimToLimit(tabs: readonly ThreadTab[], activeKey: string): readonly ThreadTab[] {
  if (tabs.length <= MAX_THREAD_TABS) return tabs;
  const evictable = tabs.findIndex((tab) => tab.key !== activeKey);
  if (evictable < 0) return tabs;
  return [...tabs.slice(0, evictable), ...tabs.slice(evictable + 1)];
}

export function resolveNextActiveKey(
  remaining: readonly ThreadTab[],
  closedIndex: number,
): string | null {
  if (remaining.length === 0) return null;
  return (remaining[closedIndex] ?? remaining[remaining.length - 1] ?? null)?.key ?? null;
}

export function closeThreadTab(state: ThreadTabsState, key: string): ThreadTabsState {
  const index = state.tabs.findIndex((tab) => tab.key === key);
  if (index < 0) return state;
  const tabs = state.tabs.filter((tab) => tab.key !== key);
  if (state.activeKey !== key) return { tabs, activeKey: state.activeKey };
  return { tabs, activeKey: resolveNextActiveKey(tabs, index) };
}

export function closeOtherThreadTabs(state: ThreadTabsState, key: string): ThreadTabsState {
  const kept = state.tabs.find((tab) => tab.key === key);
  if (!kept || state.tabs.length === 1) return state;
  return { tabs: [kept], activeKey: kept.key };
}

export function closeThreadTabsToRight(state: ThreadTabsState, key: string): ThreadTabsState {
  const index = state.tabs.findIndex((tab) => tab.key === key);
  if (index < 0 || index === state.tabs.length - 1) return state;
  const tabs = state.tabs.slice(0, index + 1);
  const activeStillOpen = tabs.some((tab) => tab.key === state.activeKey);
  return { tabs, activeKey: activeStillOpen ? state.activeKey : key };
}

export function moveThreadTab(
  state: ThreadTabsState,
  key: string,
  toIndex: number,
): ThreadTabsState {
  const fromIndex = state.tabs.findIndex((tab) => tab.key === key);
  if (fromIndex < 0) return state;
  const without = state.tabs.filter((tab) => tab.key !== key);
  const clamped = Math.max(0, Math.min(toIndex, without.length));
  if (clamped === fromIndex) return state;
  const tab = state.tabs[fromIndex]!;
  return {
    tabs: [...without.slice(0, clamped), tab, ...without.slice(clamped)],
    activeKey: state.activeKey,
  };
}

export function reconcileThreadTabs(
  state: ThreadTabsState,
  liveKeys: ReadonlySet<string>,
): ThreadTabsState {
  const tabs = state.tabs.filter((tab) => liveKeys.has(tab.key));
  if (tabs.length === state.tabs.length) return state;
  const activeStillOpen = tabs.some((tab) => tab.key === state.activeKey);
  if (activeStillOpen) return { tabs, activeKey: state.activeKey };
  const closedIndex = state.tabs.findIndex((tab) => tab.key === state.activeKey);
  return { tabs, activeKey: resolveNextActiveKey(tabs, Math.max(0, closedIndex)) };
}

export function selectThreadTab(state: ThreadTabsState, key: string | null): ThreadTab | null {
  if (key === null) return null;
  return state.tabs.find((tab) => tab.key === key) ?? null;
}

export function selectWorkspaceThreadTabs(
  state: WorkspaceThreadTabsState,
  workspaceKey: string | null,
): ThreadTabsState {
  return workspaceKey === null
    ? EMPTY_THREAD_TABS_STATE
    : (state.byWorkspaceKey[workspaceKey] ?? EMPTY_THREAD_TABS_STATE);
}

/**
 * A chat lives in exactly one checkout, so opening it here takes it away from
 * wherever it was. Promoting a draft into a new worktree moves the chat, and a
 * tab left behind in the old checkout would send that workspace's row straight
 * back to the chat that left it.
 */
export function openWorkspaceThreadTab<State extends WorkspaceThreadTabsState>(
  state: State,
  workspaceKey: string,
  ref: ScopedThreadRef,
  draftId: DraftId | null,
): State {
  const key = threadTabKey(ref);
  const opened = openThreadTab(selectWorkspaceThreadTabs(state, workspaceKey), ref, draftId);
  const others = Object.entries(state.byWorkspaceKey).flatMap(([candidateKey, tabs]) =>
    candidateKey === workspaceKey ? [] : [[candidateKey, closeThreadTab(tabs, key)] as const],
  );
  const unchanged =
    state.activeWorkspaceKey === workspaceKey &&
    state.byWorkspaceKey[workspaceKey] === opened &&
    others.every(([candidateKey, tabs]) => state.byWorkspaceKey[candidateKey] === tabs);
  if (unchanged) return state;
  return {
    ...state,
    byWorkspaceKey: { ...Object.fromEntries(others), [workspaceKey]: opened },
    activeWorkspaceKey: workspaceKey,
  };
}

/**
 * The slice of the strip that travels between devices: which real chats are
 * open, in tab order.
 *
 * Draft tabs are dropped — their thread ids are reserved client-side and mean
 * nothing to another device — and a workspace whose tabs are all drafts is
 * omitted entirely. An absent workspace therefore reads the same as an empty
 * one: nothing open here.
 */
export function selectSyncableWorkspaceThreadTabs(
  state: WorkspaceThreadTabsState,
): WorkspaceThreadTabsSettings {
  return {
    version: state.syncVersion,
    byWorkspaceKey: Object.fromEntries(
      Object.entries(state.byWorkspaceKey).flatMap(([workspaceKey, tabs]) => {
        const shared: WorkspaceThreadTab[] = tabs.tabs
          .filter((tab) => tab.draftId === null)
          .map((tab) => ({ environmentId: tab.environmentId, threadId: tab.threadId }));
        return shared.length > 0 ? [[workspaceKey, shared] as const] : [];
      }),
    ),
  };
}

function remoteTabsForWorkspace(
  current: ThreadTabsState,
  remoteTabs: ReadonlyArray<WorkspaceThreadTab>,
): readonly ThreadTab[] {
  const existingByKey = new Map(current.tabs.map((tab) => [tab.key, tab] as const));
  const seen = new Set<string>();
  const adopted: ThreadTab[] = [];

  for (const entry of remoteTabs) {
    if (entry.environmentId.length === 0 || entry.threadId.length === 0) continue;
    const ref = scopeThreadRef(
      EnvironmentId.make(entry.environmentId),
      ThreadId.make(entry.threadId),
    );
    const key = threadTabKey(ref);
    if (seen.has(key)) continue;
    seen.add(key);
    // Reuse the local object when this chat is already open here: the tab
    // rows are memoized on identity, so a re-sync that changes nothing must
    // not hand React a fresh array of fresh objects.
    adopted.push(
      existingByKey.get(key) ?? {
        key,
        environmentId: ref.environmentId,
        threadId: ref.threadId,
        draftId: null,
      },
    );
  }

  // A remote device must not close the chat this device is currently showing.
  // Keep that one real tab locally; the next sync publishes the merged open
  // set so both devices converge without moving either user's focus.
  const activeTab = current.tabs.find((tab) => tab.key === current.activeKey);
  if (activeTab?.draftId === null && !seen.has(activeTab.key)) {
    seen.add(activeTab.key);
    adopted.push(activeTab);
  }

  // Unsent draft sessions never left this browser, so the remote set has
  // nothing to say about them: they keep their tabs, after the shared ones.
  for (const tab of current.tabs) {
    if (tab.draftId === null || seen.has(tab.key)) continue;
    seen.add(tab.key);
    adopted.push(tab);
  }

  return adopted;
}

function tabListsEqual(left: readonly ThreadTab[], right: readonly ThreadTab[]): boolean {
  return left.length === right.length && left.every((tab, index) => tab === right[index]);
}

/**
 * Converges this device's strip on the open set another device published.
 *
 * The remote value is authoritative for real chats except for the tab this
 * device is currently showing. That makes chats opened and closed elsewhere
 * sync without letting another device move this device's focus.
 */
export function applyRemoteWorkspaceThreadTabs<State extends WorkspaceThreadTabsState>(
  state: State,
  remote: WorkspaceThreadTabsSettings,
): State {
  const workspaceKeys = new Set([
    ...Object.keys(state.byWorkspaceKey),
    ...Object.keys(remote.byWorkspaceKey),
  ]);
  const next: Record<string, ThreadTabsState> = {};
  let changed = state.syncVersion !== remote.version;

  for (const workspaceKey of workspaceKeys) {
    const known = workspaceKey in state.byWorkspaceKey;
    const current = selectWorkspaceThreadTabs(state, workspaceKey);
    const tabs = remoteTabsForWorkspace(current, remote.byWorkspaceKey[workspaceKey] ?? []);
    // A remote workspace this device has never opened and has nothing open in
    // adds no information — recording it would just grow the stored map.
    if (!known && tabs.length === 0) continue;
    if (tabListsEqual(current.tabs, tabs)) {
      next[workspaceKey] = current;
      continue;
    }
    changed = true;
    const activeKey = tabs.some((tab) => tab.key === current.activeKey)
      ? current.activeKey
      : (tabs[tabs.length - 1]?.key ?? null);
    next[workspaceKey] = { tabs, activeKey };
  }

  return changed ? { ...state, byWorkspaceKey: next, syncVersion: remote.version } : state;
}

interface ThreadTabsStore extends WorkspaceThreadTabsState {
  openTab: (workspaceKey: string, ref: ScopedThreadRef, draftId: DraftId | null) => void;
  closeTab: (workspaceKey: string, key: string) => void;
  closeOthers: (workspaceKey: string, key: string) => void;
  closeToRight: (workspaceKey: string, key: string) => void;
  closeAll: (workspaceKey: string) => void;
  moveTab: (workspaceKey: string, key: string, toIndex: number) => void;
  reconcile: (workspaceKey: string, liveKeys: ReadonlySet<string>) => void;
  /** Adopt the open set published by another device, and its ordering. */
  applyRemoteTabs: (remote: WorkspaceThreadTabsSettings) => void;
  /** Claim a version for a change made here, before publishing it. */
  stampSyncVersion: (version: number) => void;
}

function updateWorkspace(
  state: ThreadTabsStore,
  workspaceKey: string,
  update: (tabs: ThreadTabsState) => ThreadTabsState,
): Pick<ThreadTabsStore, "byWorkspaceKey"> {
  const current = selectWorkspaceThreadTabs(state, workspaceKey);
  const next = update(current);
  if (next === current) return { byWorkspaceKey: state.byWorkspaceKey };
  return {
    byWorkspaceKey: {
      ...state.byWorkspaceKey,
      [workspaceKey]: next,
    },
  };
}

export const useThreadTabsStore = create<ThreadTabsStore>()(
  persist(
    (set) => ({
      byWorkspaceKey: {},
      activeWorkspaceKey: null,
      syncVersion: 0,
      openTab: (workspaceKey, ref, draftId) =>
        set((state) => openWorkspaceThreadTab(state, workspaceKey, ref, draftId)),
      closeTab: (workspaceKey, key) =>
        set((state) => updateWorkspace(state, workspaceKey, (tabs) => closeThreadTab(tabs, key))),
      closeOthers: (workspaceKey, key) =>
        set((state) =>
          updateWorkspace(state, workspaceKey, (tabs) => closeOtherThreadTabs(tabs, key)),
        ),
      closeToRight: (workspaceKey, key) =>
        set((state) =>
          updateWorkspace(state, workspaceKey, (tabs) => closeThreadTabsToRight(tabs, key)),
        ),
      closeAll: (workspaceKey) =>
        set((state) => ({
          byWorkspaceKey: {
            ...state.byWorkspaceKey,
            [workspaceKey]: EMPTY_THREAD_TABS_STATE,
          },
        })),
      moveTab: (workspaceKey, key, toIndex) =>
        set((state) =>
          updateWorkspace(state, workspaceKey, (tabs) => moveThreadTab(tabs, key, toIndex)),
        ),
      reconcile: (workspaceKey, liveKeys) =>
        set((state) =>
          updateWorkspace(state, workspaceKey, (tabs) => reconcileThreadTabs(tabs, liveKeys)),
        ),
      applyRemoteTabs: (remote) => set((state) => applyRemoteWorkspaceThreadTabs(state, remote)),
      stampSyncVersion: (version) =>
        set((state) => (state.syncVersion === version ? state : { syncVersion: version })),
    }),
    {
      name: THREAD_TABS_STORAGE_KEY,
      version: THREAD_TABS_STORAGE_VERSION,
      storage: createJSONStorage(() =>
        resolveStorage(typeof window !== "undefined" ? window.localStorage : undefined),
      ),
      partialize: (state) => ({
        byWorkspaceKey: state.byWorkspaceKey,
        activeWorkspaceKey: state.activeWorkspaceKey,
        syncVersion: state.syncVersion,
      }),
      migrate: migratePersistedThreadTabs,
    },
  ),
);

function migrateTabState(persistedState: unknown): ThreadTabsState {
  if (!persistedState || typeof persistedState !== "object") return EMPTY_THREAD_TABS_STATE;
  const raw = persistedState as Partial<ThreadTabsState>;
  const seen = new Set<string>();
  const tabs = Array.isArray(raw.tabs)
    ? raw.tabs.flatMap<ThreadTab>((entry) => {
        if (!entry || typeof entry !== "object") return [];
        const { environmentId, threadId, draftId } = entry as Partial<ThreadTab>;
        if (typeof environmentId !== "string" || typeof threadId !== "string") return [];
        const ref = scopeThreadRef(EnvironmentId.make(environmentId), ThreadId.make(threadId));
        const key = threadTabKey(ref);
        if (seen.has(key)) return [];
        seen.add(key);
        return [
          {
            key,
            environmentId: ref.environmentId,
            threadId: ref.threadId,
            draftId: typeof draftId === "string" ? DraftId.make(draftId) : null,
          },
        ];
      })
    : [];
  const activeKey =
    typeof raw.activeKey === "string" && tabs.some((tab) => tab.key === raw.activeKey)
      ? raw.activeKey
      : (tabs[tabs.length - 1]?.key ?? null);
  return { tabs, activeKey };
}

export function migratePersistedThreadTabs(persistedState: unknown): WorkspaceThreadTabsState {
  if (!persistedState || typeof persistedState !== "object") {
    return EMPTY_WORKSPACE_THREAD_TABS_STATE;
  }
  const raw = persistedState as Partial<WorkspaceThreadTabsState>;
  if (!raw.byWorkspaceKey || typeof raw.byWorkspaceKey !== "object") {
    // The v1 global strip cannot be assigned to a checkout safely.
    return EMPTY_WORKSPACE_THREAD_TABS_STATE;
  }
  return {
    byWorkspaceKey: Object.fromEntries(
      Object.entries(raw.byWorkspaceKey).map(([workspaceKey, tabs]) => [
        workspaceKey,
        migrateTabState(tabs),
      ]),
    ),
    activeWorkspaceKey:
      typeof raw.activeWorkspaceKey === "string" && raw.byWorkspaceKey[raw.activeWorkspaceKey]
        ? raw.activeWorkspaceKey
        : null,
    // A strip persisted before syncing existed has never been published, so
    // it starts at zero and hands itself over on first contact.
    syncVersion:
      typeof raw.syncVersion === "number" &&
      Number.isInteger(raw.syncVersion) &&
      raw.syncVersion > 0
        ? raw.syncVersion
        : 0,
  };
}
