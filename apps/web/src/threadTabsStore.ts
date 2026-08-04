/** Workspace-scoped chat tabs for the Conductor-style workspace header. */
import { scopeThreadRef, scopedThreadKey } from "@t3tools/client-runtime/environment";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import type { ScopedThreadRef } from "@t3tools/contracts";
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
}

export const EMPTY_THREAD_TABS_STATE: ThreadTabsState = { tabs: [], activeKey: null };
export const EMPTY_WORKSPACE_THREAD_TABS_STATE: WorkspaceThreadTabsState = {
  byWorkspaceKey: {},
  activeWorkspaceKey: null,
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

interface ThreadTabsStore extends WorkspaceThreadTabsState {
  openTab: (workspaceKey: string, ref: ScopedThreadRef, draftId: DraftId | null) => void;
  closeTab: (workspaceKey: string, key: string) => void;
  closeOthers: (workspaceKey: string, key: string) => void;
  closeToRight: (workspaceKey: string, key: string) => void;
  closeAll: (workspaceKey: string) => void;
  moveTab: (workspaceKey: string, key: string, toIndex: number) => void;
  reconcile: (workspaceKey: string, liveKeys: ReadonlySet<string>) => void;
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
      openTab: (workspaceKey, ref, draftId) =>
        set((state) => ({
          ...updateWorkspace(state, workspaceKey, (tabs) => openThreadTab(tabs, ref, draftId)),
          activeWorkspaceKey: workspaceKey,
        })),
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
  };
}
