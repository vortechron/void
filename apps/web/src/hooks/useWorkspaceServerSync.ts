/**
 * Mirrors the browser-local workspace stores through server-owned client
 * settings, so every device the server is reached from shows the same chats.
 *
 * Without this, a chat started on a phone over the tailnet never appeared on
 * the laptop: the chat itself is server state and syncs fine, but *which
 * chats are open* lived in each browser's localStorage, so on the laptop the
 * chat was only reachable through the workspace's chat history menu.
 *
 * Same shape as `useThemeServerSync`: the server owns the value, each device
 * converges on it, and a value that has not changed since the last agreement
 * carries no news — which is what keeps a device from re-applying the echo of
 * its own write.
 *
 * Only values that survive being re-applied belong here. An open tab does: the
 * worst a stale one can do is reopen a chat that was closed a moment ago.
 * Unsent composer text does not, which is why it stays local — see the note
 * above `WorkspaceThreadTab` in the settings contract.
 */
import { useCallback, useEffect, useRef } from "react";

import { resolveSettingsSyncAction, serializeSyncedValue } from "../lib/settingsSync";
import { selectSyncableWorkspaceThreadTabs, useThreadTabsStore } from "../threadTabsStore";
import { selectSyncableWorkspaceSidebar, useWorkspaceSidebarStore } from "../workspaceSidebarStore";
import {
  useClientSettings,
  useClientSettingsHydrated,
  useUpdateClientSettings,
} from "./useSettings";

/** Tab and label changes are discrete user actions, so they can travel fast. */
const WORKSPACE_SYNC_DEBOUNCE_MS = 400;

interface SettingsMirror<Value> {
  /** The value as the server currently holds it. */
  readonly remote: Value;
  /** The syncable projection of the local store. */
  readonly readLocal: () => Value;
  readonly subscribe: (listener: () => void) => () => void;
  readonly applyRemote: (remote: Value) => void;
  readonly publish: (local: Value) => void;
  readonly isEmpty: (value: Value) => boolean;
  readonly debounceMs: number;
}

function useSettingsMirror<Value>(mirror: SettingsMirror<Value>): void {
  const hydrated = useClientSettingsHydrated();
  /** The last value both sides were known to hold. */
  const agreed = useRef<string | null>(null);
  const latest = useRef(mirror);
  latest.current = mirror;

  useEffect(() => {
    const { remote, readLocal, applyRemote, publish, isEmpty } = latest.current;
    const local = readLocal();
    const remoteSerialized = serializeSyncedValue(remote);
    const action = resolveSettingsSyncAction({
      hydrated,
      remoteSerialized,
      localSerialized: serializeSyncedValue(local),
      agreedSerialized: agreed.current,
      remoteIsEmpty: isEmpty(remote),
      localIsEmpty: isEmpty(local),
    });

    switch (action) {
      case "idle":
        if (hydrated) agreed.current = remoteSerialized;
        return;
      case "adopt-local":
        agreed.current = serializeSyncedValue(local);
        publish(local);
        return;
      case "apply-remote":
        applyRemote(remote);
        agreed.current = remoteSerialized;
        return;
    }
  }, [hydrated, mirror.remote]);

  useEffect(() => {
    if (!hydrated) return;
    let timer: number | null = null;

    const flush = () => {
      timer = null;
      const local = latest.current.readLocal();
      const serialized = serializeSyncedValue(local);
      // Equal to the agreement means this change came from the server (or
      // undid itself) — publishing it would only bounce back.
      if (serialized === agreed.current) return;
      agreed.current = serialized;
      latest.current.publish(local);
    };

    const unsubscribe = latest.current.subscribe(() => {
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(flush, latest.current.debounceMs);
    });

    return () => {
      if (timer !== null) window.clearTimeout(timer);
      unsubscribe();
    };
  }, [hydrated]);
}

function useThreadTabsServerSync(): void {
  const remote = useClientSettings((settings) => settings.workspaceThreadTabs);
  const updateClientSettings = useUpdateClientSettings();

  useSettingsMirror({
    remote,
    readLocal: useCallback(
      () => selectSyncableWorkspaceThreadTabs(useThreadTabsStore.getState()),
      [],
    ),
    subscribe: useCallback((listener: () => void) => useThreadTabsStore.subscribe(listener), []),
    applyRemote: useCallback((value: typeof remote) => {
      useThreadTabsStore.getState().applyRemoteTabs(value);
    }, []),
    publish: useCallback(
      (value: typeof remote) => updateClientSettings({ workspaceThreadTabs: value }),
      [updateClientSettings],
    ),
    isEmpty: useCallback((value: typeof remote) => Object.keys(value).length === 0, []),
    debounceMs: WORKSPACE_SYNC_DEBOUNCE_MS,
  });
}

function useWorkspaceSidebarServerSync(): void {
  const remote = useClientSettings((settings) => settings.workspaceSidebar);
  const updateClientSettings = useUpdateClientSettings();

  useSettingsMirror({
    remote,
    readLocal: useCallback(
      () => selectSyncableWorkspaceSidebar(useWorkspaceSidebarStore.getState()),
      [],
    ),
    subscribe: useCallback(
      (listener: () => void) => useWorkspaceSidebarStore.subscribe(listener),
      [],
    ),
    applyRemote: useCallback((value: typeof remote) => {
      useWorkspaceSidebarStore.getState().applyRemoteSidebar(value);
    }, []),
    publish: useCallback(
      (value: typeof remote) => updateClientSettings({ workspaceSidebar: value }),
      [updateClientSettings],
    ),
    isEmpty: useCallback(
      (value: typeof remote) =>
        Object.keys(value.namesByWorkspaceKey).length === 0 &&
        value.pinnedWorkspaceKeys.length === 0 &&
        value.archivedWorkspaceKeys.length === 0,
      [],
    ),
    debounceMs: WORKSPACE_SYNC_DEBOUNCE_MS,
  });
}

/** Keeps open chats and workspace labelling in step across every device
    connected to this server. */
export function useWorkspaceServerSync(): void {
  useThreadTabsServerSync();
  useWorkspaceSidebarServerSync();
}
