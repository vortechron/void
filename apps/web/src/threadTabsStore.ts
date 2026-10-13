/** Workspace-scoped chat tabs, listed under each workspace row in the sidebar. */
import { scopeThreadRef, scopedThreadKey } from "@t3tools/client-runtime/environment";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import type { ScopedThreadRef } from "@t3tools/contracts";
import {
  WORKSPACE_THREAD_TAB_GROUP_COLOR_VALUES,
  type WorkspaceThreadTab,
  type WorkspaceThreadTabGroup,
  type WorkspaceThreadTabGroupColor,
  type WorkspaceThreadTabsSettings,
} from "@t3tools/contracts/settings";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { DraftId } from "./composerDraftStore";
import { resolveStorage } from "./lib/storage";

const THREAD_TABS_STORAGE_KEY = "t3code:workspace-thread-tabs:v2";
const THREAD_TABS_STORAGE_VERSION = 3;

/** Beyond this the list is unreadable, so the oldest inactive tab drops off. */
export const MAX_THREAD_TABS = 12;

export const THREAD_TAB_GROUP_COLORS = WORKSPACE_THREAD_TAB_GROUP_COLOR_VALUES;
export type ThreadTabGroupColor = WorkspaceThreadTabGroupColor;

export interface ThreadTabGroup {
  readonly id: string;
  readonly name: string;
  readonly color: ThreadTabGroupColor;
  readonly collapsed: boolean;
}

export interface ThreadTab {
  readonly key: string;
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly draftId: DraftId | null;
  readonly groupId: string | null;
}

export interface ThreadTabsState {
  readonly tabs: readonly ThreadTab[];
  readonly activeKey: string | null;
  readonly groups: readonly ThreadTabGroup[];
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

export const EMPTY_THREAD_TABS_STATE: ThreadTabsState = { tabs: [], activeKey: null, groups: [] };
export const EMPTY_WORKSPACE_THREAD_TABS_STATE: WorkspaceThreadTabsState = {
  byWorkspaceKey: {},
  activeWorkspaceKey: null,
  syncVersion: 0,
};

export function threadTabKey(ref: ScopedThreadRef): string {
  return scopedThreadKey(ref);
}

export function threadTabRef(tab: Pick<ThreadTab, "environmentId" | "threadId">): ScopedThreadRef {
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
    const groups = existing.groupId
      ? state.groups.map((group) =>
          group.id === existing.groupId && group.collapsed ? { ...group, collapsed: false } : group,
        )
      : state.groups;
    const groupsChanged = groups.some((group, index) => group !== state.groups[index]);
    if (tabs === state.tabs && state.activeKey === key && !groupsChanged) return state;
    return { tabs, activeKey: key, groups };
  }

  const tab: ThreadTab = {
    key,
    environmentId: ref.environmentId,
    threadId: ref.threadId,
    draftId,
    groupId: null,
  };
  const appended = [...state.tabs, tab];
  return pruneEmptyThreadTabGroups({
    tabs: trimToLimit(appended, key),
    activeKey: key,
    groups: state.groups,
  });
}

function trimToLimit(tabs: readonly ThreadTab[], activeKey: string): readonly ThreadTab[] {
  if (tabs.length <= MAX_THREAD_TABS) return tabs;
  const evictable = tabs.findIndex((tab) => tab.key !== activeKey);
  if (evictable < 0) return tabs;
  return [...tabs.slice(0, evictable), ...tabs.slice(evictable + 1)];
}

function pruneEmptyThreadTabGroups(state: ThreadTabsState): ThreadTabsState {
  const liveGroupIds = new Set(
    state.tabs.flatMap((tab) => (tab.groupId === null ? [] : [tab.groupId])),
  );
  const groups = state.groups.filter((group) => liveGroupIds.has(group.id));
  return groups.length === state.groups.length ? state : { ...state, groups };
}

function coalesceThreadTabGroups(tabs: readonly ThreadTab[]): readonly ThreadTab[] {
  const seenGroupIds = new Set<string>();
  const next: ThreadTab[] = [];
  for (const tab of tabs) {
    if (tab.groupId === null) {
      next.push(tab);
      continue;
    }
    if (seenGroupIds.has(tab.groupId)) continue;
    seenGroupIds.add(tab.groupId);
    next.push(...tabs.filter((candidate) => candidate.groupId === tab.groupId));
  }
  return tabListsEqual(tabs, next) ? tabs : next;
}

export function createThreadTabGroup(
  state: ThreadTabsState,
  key: string,
  input: Pick<ThreadTabGroup, "id" | "name" | "color">,
): ThreadTabsState {
  const name = input.name.trim();
  if (
    name.length === 0 ||
    input.id.length === 0 ||
    state.groups.some((group) => group.id === input.id) ||
    !THREAD_TAB_GROUP_COLORS.includes(input.color)
  ) {
    return state;
  }
  const tabIndex = state.tabs.findIndex((tab) => tab.key === key);
  if (tabIndex < 0) return state;
  const tabs = state.tabs.map((candidate) =>
    candidate.key === key ? { ...candidate, groupId: input.id } : candidate,
  );
  const withoutEmptyPreviousGroup = pruneEmptyThreadTabGroups({
    tabs,
    activeKey: state.activeKey,
    groups: state.groups,
  });
  return {
    ...withoutEmptyPreviousGroup,
    groups: [
      ...withoutEmptyPreviousGroup.groups,
      { id: input.id, name, color: input.color, collapsed: false },
    ],
  };
}

export function addThreadTabToGroup(
  state: ThreadTabsState,
  key: string,
  groupId: string,
): ThreadTabsState {
  const group = state.groups.find((candidate) => candidate.id === groupId);
  const tabIndex = state.tabs.findIndex((tab) => tab.key === key);
  if (!group || tabIndex < 0 || state.tabs[tabIndex]?.groupId === groupId) return state;

  const tab = state.tabs[tabIndex]!;
  const without = state.tabs.filter((candidate) => candidate.key !== key);
  const lastGroupIndex = without.findLastIndex((candidate) => candidate.groupId === groupId);
  const insertionIndex = lastGroupIndex < 0 ? tabIndex : lastGroupIndex + 1;
  const groupedTab = { ...tab, groupId };
  return pruneEmptyThreadTabGroups({
    tabs: [...without.slice(0, insertionIndex), groupedTab, ...without.slice(insertionIndex)],
    activeKey: state.activeKey,
    groups: state.groups,
  });
}

export function removeThreadTabFromGroup(state: ThreadTabsState, key: string): ThreadTabsState {
  const tabIndex = state.tabs.findIndex((tab) => tab.key === key);
  const tab = state.tabs[tabIndex];
  if (!tab?.groupId) return state;

  const without = state.tabs.filter((candidate) => candidate.key !== key);
  const lastGroupIndex = without.findLastIndex((candidate) => candidate.groupId === tab.groupId);
  const insertionIndex = lastGroupIndex < 0 ? tabIndex : lastGroupIndex + 1;
  const ungroupedTab = { ...tab, groupId: null };
  return pruneEmptyThreadTabGroups({
    tabs: [...without.slice(0, insertionIndex), ungroupedTab, ...without.slice(insertionIndex)],
    activeKey: state.activeKey,
    groups: state.groups,
  });
}

export function toggleThreadTabGroup(state: ThreadTabsState, groupId: string): ThreadTabsState {
  let changed = false;
  const groups = state.groups.map((group) => {
    if (group.id !== groupId) return group;
    changed = true;
    return { ...group, collapsed: !group.collapsed };
  });
  return changed ? { ...state, groups } : state;
}

export function updateThreadTabGroup(
  state: ThreadTabsState,
  groupId: string,
  update: Partial<Pick<ThreadTabGroup, "name" | "color">>,
): ThreadTabsState {
  const name = update.name?.trim();
  if (update.name !== undefined && !name) return state;
  if (update.color !== undefined && !THREAD_TAB_GROUP_COLORS.includes(update.color)) return state;

  let changed = false;
  const groups = state.groups.map((group) => {
    if (group.id !== groupId) return group;
    const nextName = name ?? group.name;
    const nextColor = update.color ?? group.color;
    if (nextName === group.name && nextColor === group.color) return group;
    changed = true;
    return { ...group, name: nextName, color: nextColor };
  });
  return changed ? { ...state, groups } : state;
}

export function ungroupThreadTabs(state: ThreadTabsState, groupId: string): ThreadTabsState {
  if (!state.groups.some((group) => group.id === groupId)) return state;
  return {
    ...state,
    tabs: state.tabs.map((tab) => (tab.groupId === groupId ? { ...tab, groupId: null } : tab)),
    groups: state.groups.filter((group) => group.id !== groupId),
  };
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
  return pruneEmptyThreadTabGroups({
    tabs,
    activeKey: state.activeKey !== key ? state.activeKey : resolveNextActiveKey(tabs, index),
    groups: state.groups,
  });
}

export function closeOtherThreadTabs(state: ThreadTabsState, key: string): ThreadTabsState {
  const kept = state.tabs.find((tab) => tab.key === key);
  if (!kept || state.tabs.length === 1) return state;
  return pruneEmptyThreadTabGroups({ tabs: [kept], activeKey: kept.key, groups: state.groups });
}

export function closeThreadTabsToRight(state: ThreadTabsState, key: string): ThreadTabsState {
  const index = state.tabs.findIndex((tab) => tab.key === key);
  if (index < 0 || index === state.tabs.length - 1) return state;
  const tabs = state.tabs.slice(0, index + 1);
  const activeStillOpen = tabs.some((tab) => tab.key === state.activeKey);
  return pruneEmptyThreadTabGroups({
    tabs,
    activeKey: activeStillOpen ? state.activeKey : key,
    groups: state.groups,
  });
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
  const leftGroupId = without[clamped - 1]?.groupId ?? null;
  const rightGroupId = without[clamped]?.groupId ?? null;
  const ownGroupStillHasTabs =
    tab.groupId !== null && without.some((candidate) => candidate.groupId === tab.groupId);
  const groupId =
    tab.groupId !== null
      ? !ownGroupStillHasTabs || leftGroupId === tab.groupId || rightGroupId === tab.groupId
        ? tab.groupId
        : null
      : leftGroupId !== null && leftGroupId === rightGroupId
        ? leftGroupId
        : null;
  const movedTab = groupId === tab.groupId ? tab : { ...tab, groupId };
  return pruneEmptyThreadTabGroups({
    tabs: [...without.slice(0, clamped), movedTab, ...without.slice(clamped)],
    activeKey: state.activeKey,
    groups: state.groups,
  });
}

export function reconcileThreadTabs(
  state: ThreadTabsState,
  liveKeys: ReadonlySet<string>,
): ThreadTabsState {
  const tabs = state.tabs.filter((tab) => liveKeys.has(tab.key));
  if (tabs.length === state.tabs.length) return state;
  const activeStillOpen = tabs.some((tab) => tab.key === state.activeKey);
  if (activeStillOpen) {
    return pruneEmptyThreadTabGroups({ tabs, activeKey: state.activeKey, groups: state.groups });
  }
  const closedIndex = state.tabs.findIndex((tab) => tab.key === state.activeKey);
  return pruneEmptyThreadTabGroups({
    tabs,
    activeKey: resolveNextActiveKey(tabs, Math.max(0, closedIndex)),
    groups: state.groups,
  });
}

export type ThreadTabCloseFollow =
  | { readonly kind: "stay" }
  | { readonly kind: "open"; readonly tab: ThreadTab }
  | { readonly kind: "new" };

/**
 * Where the view goes after tabs close in one workspace. Only a close that took
 * away the chat on screen moves it: to the tab that took over, or to a fresh
 * chat in the same checkout when nothing there is left open. Left on screen,
 * the closed chat's route would open its tab again on the next reload.
 */
export function resolveThreadTabCloseFollow(input: {
  readonly routeThreadKey: string | null;
  readonly before: ThreadTabsState;
  readonly after: ThreadTabsState;
}): ThreadTabCloseFollow {
  const { routeThreadKey, before, after } = input;
  if (routeThreadKey === null) return { kind: "stay" };
  if (!before.tabs.some((tab) => tab.key === routeThreadKey)) return { kind: "stay" };
  if (after.tabs.some((tab) => tab.key === routeThreadKey)) return { kind: "stay" };
  const next = selectThreadTab(after, after.activeKey);
  return next ? { kind: "open", tab: next } : { kind: "new" };
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
  const byWorkspaceKey: Record<string, WorkspaceThreadTab[]> = {};
  const groupsByWorkspaceKey: Record<string, WorkspaceThreadTabGroup[]> = {};

  for (const [workspaceKey, tabs] of Object.entries(state.byWorkspaceKey)) {
    const shared = tabs.tabs
      .filter((tab) => tab.draftId === null)
      .map((tab) => ({
        environmentId: tab.environmentId,
        threadId: tab.threadId,
        groupId: tab.groupId,
      }));
    if (shared.length === 0) continue;
    byWorkspaceKey[workspaceKey] = shared;

    const groupById = new Map(tabs.groups.map((group) => [group.id, group] as const));
    const seenGroupIds = new Set<string>();
    const sharedGroups = shared.flatMap<WorkspaceThreadTabGroup>((tab) => {
      if (!tab.groupId || seenGroupIds.has(tab.groupId)) return [];
      const group = groupById.get(tab.groupId);
      if (!group) return [];
      seenGroupIds.add(tab.groupId);
      return [{ id: group.id, name: group.name, color: group.color }];
    });
    if (sharedGroups.length > 0) groupsByWorkspaceKey[workspaceKey] = sharedGroups;
  }

  return {
    version: state.syncVersion,
    byWorkspaceKey,
    groupsByWorkspaceKey,
  };
}

function remoteTabsForWorkspace(
  current: ThreadTabsState,
  remoteTabs: ReadonlyArray<WorkspaceThreadTab>,
  remoteGroups: ReadonlyArray<WorkspaceThreadTabGroup>,
): readonly ThreadTab[] {
  const existingByKey = new Map(current.tabs.map((tab) => [tab.key, tab] as const));
  const remoteGroupIds = new Set(remoteGroups.map((group) => group.id));
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
    const groupId = entry.groupId && remoteGroupIds.has(entry.groupId) ? entry.groupId : null;
    // Reuse the local object when this chat is already open here: the tab
    // rows are memoized on identity, so a re-sync that changes nothing must
    // not hand React a fresh array of fresh objects.
    const existing = existingByKey.get(key);
    adopted.push(
      existing
        ? existing.groupId === groupId
          ? existing
          : { ...existing, groupId }
        : {
            key,
            environmentId: ref.environmentId,
            threadId: ref.threadId,
            draftId: null,
            groupId,
          },
    );
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

function remoteGroupsForWorkspace(
  current: ThreadTabsState,
  remoteGroups: ReadonlyArray<WorkspaceThreadTabGroup>,
  tabs: readonly ThreadTab[],
): readonly ThreadTabGroup[] {
  const currentById = new Map(current.groups.map((group) => [group.id, group] as const));
  const remoteById = new Map(remoteGroups.map((group) => [group.id, group] as const));
  const seen = new Set<string>();
  const groups: ThreadTabGroup[] = [];

  for (const tab of tabs) {
    if (!tab.groupId || seen.has(tab.groupId)) continue;
    const remote = remoteById.get(tab.groupId);
    const local = currentById.get(tab.groupId);
    if (!remote && !local) continue;
    seen.add(tab.groupId);
    groups.push(
      remote
        ? local && local.name === remote.name && local.color === remote.color
          ? local
          : { ...remote, collapsed: local?.collapsed ?? false }
        : local!,
    );
  }

  return groupListsEqual(current.groups, groups) ? current.groups : groups;
}

function tabListsEqual(left: readonly ThreadTab[], right: readonly ThreadTab[]): boolean {
  return left.length === right.length && left.every((tab, index) => tab === right[index]);
}

function groupListsEqual(
  left: readonly ThreadTabGroup[],
  right: readonly ThreadTabGroup[],
): boolean {
  return left.length === right.length && left.every((group, index) => group === right[index]);
}

/**
 * Converges this device's strip on the open set another device published.
 *
 * The remote value is authoritative for real chats. That makes a chat opened
 * on one device appear everywhere, and makes a close stay closed instead of
 * being restored by another device that still had the tab active.
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
    const remoteGroups = remote.groupsByWorkspaceKey[workspaceKey] ?? [];
    const tabs = coalesceThreadTabGroups(
      remoteTabsForWorkspace(current, remote.byWorkspaceKey[workspaceKey] ?? [], remoteGroups),
    );
    const groups = remoteGroupsForWorkspace(current, remoteGroups, tabs);
    // A remote workspace this device has never opened and has nothing open in
    // adds no information — recording it would just grow the stored map.
    if (!known && tabs.length === 0) continue;
    if (tabListsEqual(current.tabs, tabs) && groupListsEqual(current.groups, groups)) {
      next[workspaceKey] = current;
      continue;
    }
    changed = true;
    const activeKey = tabs.some((tab) => tab.key === current.activeKey)
      ? current.activeKey
      : (tabs[tabs.length - 1]?.key ?? null);
    next[workspaceKey] = pruneEmptyThreadTabGroups({
      tabs,
      activeKey,
      groups,
    });
  }

  return changed ? { ...state, byWorkspaceKey: next, syncVersion: remote.version } : state;
}

export interface RemotelyClosedTab {
  readonly workspaceKey: string;
  readonly key: string;
}

/**
 * The chat this device was showing, if a remote set just closed its tab.
 *
 * The strip moves the view off it the way a local close does. Left on screen,
 * the chat's route would open its tab again on the next reload and undo the
 * close on every device.
 */
export function findRemotelyClosedActiveTab(
  before: WorkspaceThreadTabsState,
  after: WorkspaceThreadTabsState,
): RemotelyClosedTab | null {
  const workspaceKey = before.activeWorkspaceKey;
  if (workspaceKey === null) return null;
  const key = selectWorkspaceThreadTabs(before, workspaceKey).activeKey;
  if (key === null) return null;
  const stillOpen = selectWorkspaceThreadTabs(after, workspaceKey).tabs.some(
    (tab) => tab.key === key,
  );
  return stillOpen ? null : { workspaceKey, key };
}

interface ThreadTabsStore extends WorkspaceThreadTabsState {
  /** Set by the latest remote apply; device-local, never persisted. */
  remotelyClosedActiveTab: RemotelyClosedTab | null;
  openTab: (workspaceKey: string, ref: ScopedThreadRef, draftId: DraftId | null) => void;
  closeTab: (workspaceKey: string, key: string) => void;
  closeOthers: (workspaceKey: string, key: string) => void;
  closeToRight: (workspaceKey: string, key: string) => void;
  closeAll: (workspaceKey: string) => void;
  moveTab: (workspaceKey: string, key: string, toIndex: number) => void;
  createGroup: (
    workspaceKey: string,
    key: string,
    group: Pick<ThreadTabGroup, "id" | "name" | "color">,
  ) => void;
  addToGroup: (workspaceKey: string, key: string, groupId: string) => void;
  removeFromGroup: (workspaceKey: string, key: string) => void;
  toggleGroup: (workspaceKey: string, groupId: string) => void;
  updateGroup: (
    workspaceKey: string,
    groupId: string,
    update: Partial<Pick<ThreadTabGroup, "name" | "color">>,
  ) => void;
  ungroup: (workspaceKey: string, groupId: string) => void;
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
      remotelyClosedActiveTab: null,
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
      createGroup: (workspaceKey, key, group) =>
        set((state) =>
          updateWorkspace(state, workspaceKey, (tabs) => createThreadTabGroup(tabs, key, group)),
        ),
      addToGroup: (workspaceKey, key, groupId) =>
        set((state) =>
          updateWorkspace(state, workspaceKey, (tabs) => addThreadTabToGroup(tabs, key, groupId)),
        ),
      removeFromGroup: (workspaceKey, key) =>
        set((state) =>
          updateWorkspace(state, workspaceKey, (tabs) => removeThreadTabFromGroup(tabs, key)),
        ),
      toggleGroup: (workspaceKey, groupId) =>
        set((state) =>
          updateWorkspace(state, workspaceKey, (tabs) => toggleThreadTabGroup(tabs, groupId)),
        ),
      updateGroup: (workspaceKey, groupId, update) =>
        set((state) =>
          updateWorkspace(state, workspaceKey, (tabs) =>
            updateThreadTabGroup(tabs, groupId, update),
          ),
        ),
      ungroup: (workspaceKey, groupId) =>
        set((state) =>
          updateWorkspace(state, workspaceKey, (tabs) => ungroupThreadTabs(tabs, groupId)),
        ),
      reconcile: (workspaceKey, liveKeys) =>
        set((state) =>
          updateWorkspace(state, workspaceKey, (tabs) => reconcileThreadTabs(tabs, liveKeys)),
        ),
      applyRemoteTabs: (remote) =>
        set((state) => {
          const next = applyRemoteWorkspaceThreadTabs(state, remote);
          if (next === state) return state;
          return { ...next, remotelyClosedActiveTab: findRemotelyClosedActiveTab(state, next) };
        }),
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
  const seenGroupIds = new Set<string>();
  const groups = Array.isArray(raw.groups)
    ? raw.groups.flatMap<ThreadTabGroup>((entry) => {
        if (!entry || typeof entry !== "object") return [];
        const { id, name, color, collapsed } = entry as Partial<ThreadTabGroup>;
        const trimmedName = typeof name === "string" ? name.trim() : "";
        if (
          typeof id !== "string" ||
          id.length === 0 ||
          trimmedName.length === 0 ||
          !isThreadTabGroupColor(color) ||
          seenGroupIds.has(id)
        ) {
          return [];
        }
        seenGroupIds.add(id);
        return [{ id, name: trimmedName, color, collapsed: collapsed === true }];
      })
    : [];
  const seen = new Set<string>();
  const tabs = Array.isArray(raw.tabs)
    ? raw.tabs.flatMap<ThreadTab>((entry) => {
        if (!entry || typeof entry !== "object") return [];
        const { environmentId, threadId, draftId, groupId } = entry as Partial<ThreadTab>;
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
            groupId: typeof groupId === "string" && seenGroupIds.has(groupId) ? groupId : null,
          },
        ];
      })
    : [];
  const activeKey =
    typeof raw.activeKey === "string" && tabs.some((tab) => tab.key === raw.activeKey)
      ? raw.activeKey
      : (tabs[tabs.length - 1]?.key ?? null);
  return pruneEmptyThreadTabGroups({
    tabs: coalesceThreadTabGroups(tabs),
    activeKey,
    groups,
  });
}

function isThreadTabGroupColor(value: unknown): value is ThreadTabGroupColor {
  return THREAD_TAB_GROUP_COLORS.some((color) => color === value);
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
