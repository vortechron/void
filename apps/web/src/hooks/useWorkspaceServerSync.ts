/**
 * Mirrors the browser-local workspace stores through server-owned client
 * settings, so every device the server is reached from shows the same chats.
 *
 * Without this, a chat started on a phone over the tailnet never appeared on
 * the laptop: the chat itself is server state and syncs fine, but *which
 * chats are open* lived in each browser's localStorage, so on the laptop the
 * chat was only reachable through the workspace's chat history menu.
 *
 * Each mirrored value carries a version (see `WorkspaceSyncVersion`). A local
 * change claims the next one the moment it happens — before the debounced
 * publish, so a reload or a remount in that window still knows this device
 * holds the later edit. Everything else follows from comparing versions.
 *
 * Only values that survive being re-applied belong here. An open tab does: the
 * worst a stale one can do is reopen a chat that was closed a moment ago.
 * Unsent composer text does not, which is why it stays local — see the note
 * above `WorkspaceThreadTab` in the settings contract.
 */
import { useCallback, useEffect, useRef } from "react";

import {
  nextSyncVersion,
  resolveSettingsSyncAction,
  serializeSyncedValue,
} from "../lib/settingsSync";
import { usePrimaryEnvironment } from "../state/environments";
import { selectSyncableWorkspaceThreadTabs, useThreadTabsStore } from "../threadTabsStore";
import { selectSyncableWorkspaceSidebar, useWorkspaceSidebarStore } from "../workspaceSidebarStore";
import {
  useClientSettings,
  useClientSettingsHydrated,
  useUpdateClientSettings,
} from "./useSettings";

/** Tab and label changes are discrete user actions, so they can travel fast. */
const WORKSPACE_SYNC_DEBOUNCE_MS = 400;

/** A mirrored value: the payload plus the counter that orders it. */
interface VersionedValue {
  readonly version: number;
}

interface SettingsMirror<Value extends VersionedValue> {
  /** The value as the server currently holds it. */
  readonly remote: Value;
  /** The syncable projection of the local store. */
  readonly readLocal: () => Value;
  readonly subscribe: (listener: () => void) => () => void;
  readonly applyRemote: (remote: Value) => void;
  /** Record a version for a local change, before it is published. */
  readonly stampVersion: (version: number) => void;
  readonly publish: (local: Value) => void;
  readonly isEmpty: (value: Value) => boolean;
  readonly debounceMs: number;
}

/** Compare payloads only: the version is the ordering, not the content. */
function serializeContent<Value extends VersionedValue>(value: Value): string {
  const { version: _version, ...content } = value;
  return serializeSyncedValue(content);
}

function useSettingsMirror<Value extends VersionedValue>(mirror: SettingsMirror<Value>): void {
  const hydrated = useClientSettingsHydrated();
  // Settings hydrate from the cached config before the socket is up, and a
  // write sent then fails with nothing to retry it. Publishing waits for a live
  // connection; the exchange below runs again the moment one arrives.
  const connected = usePrimaryEnvironment()?.connection.phase === "connected";
  const latest = useRef(mirror);
  latest.current = mirror;
  const latestConnected = useRef(connected);
  latestConnected.current = connected;
  /** Local content as of the last time this hook looked, to tell a real local
      change apart from a re-render or an echo of the server's own value. */
  const lastLocalContent = useRef<string | null>(null);
  /**
   * The (local, remote) pair the last publish was decided from. Publishing
   * makes the server's value match, so the same pair coming back means the
   * write did not take — and repeating it on every echo would spin at the
   * speed of the RPC. Any real change on either side is a different pair and
   * goes through.
   */
  const lastPublishAttempt = useRef<string | null>(null);

  useEffect(() => {
    const { remote, readLocal, applyRemote, publish, stampVersion, isEmpty } = latest.current;
    const local = readLocal();
    const localContent = serializeContent(local);
    const remoteContent = serializeContent(remote);
    const action = resolveSettingsSyncAction({
      hydrated,
      remoteVersion: remote.version,
      localVersion: local.version,
      sameContent: localContent === remoteContent,
      localIsEmpty: isEmpty(local),
    });

    switch (action) {
      case "idle":
        lastLocalContent.current = localContent;
        return;
      case "apply-remote":
        // Recorded before applying: the store notifies synchronously, and the
        // listener must see this change as the server's, not as a local edit.
        // Taking it for a local edit claims a version that ties the other
        // device's next change, and the tie publishes this stale set over it.
        lastLocalContent.current = serializeContent(remote);
        applyRemote(remote);
        return;
      case "publish-local": {
        if (!connected) return;
        const attempt = `${localContent}\u0000${remoteContent}`;
        if (attempt === lastPublishAttempt.current) return;
        lastPublishAttempt.current = attempt;
        const version = nextSyncVersion({
          localVersion: local.version,
          remoteVersion: remote.version,
        });
        stampVersion(version);
        lastLocalContent.current = localContent;
        publish({ ...local, version });
        return;
      }
    }
  }, [connected, hydrated, mirror.remote]);

  useEffect(() => {
    if (!hydrated) return;
    let timer: number | null = null;

    const publishLocal = () => {
      timer = null;
      if (!latestConnected.current) return;
      const local = latest.current.readLocal();
      const remote = latest.current.remote;
      const localContent = serializeContent(local);
      const remoteContent = serializeContent(remote);
      if (localContent === remoteContent) {
        // Nothing to say after all: a change that undid itself, or one the
        // server already had. Give the claimed version back, or a later edit
        // from another device would lose to an edit that never happened.
        latest.current.stampVersion(remote.version);
        return;
      }
      lastPublishAttempt.current = `${localContent}\u0000${remoteContent}`;
      latest.current.publish(local);
    };

    const unsubscribe = latest.current.subscribe(() => {
      const local = latest.current.readLocal();
      const localContent = serializeContent(local);
      if (localContent === lastLocalContent.current) return;
      lastLocalContent.current = localContent;

      // Claim the version now rather than at publish time: a reload, a remount
      // or an incoming remote value inside the debounce window must already
      // see that this device holds the later edit. Otherwise closing every tab
      // loses to the pre-close set that is still sitting on the server.
      const version = nextSyncVersion({
        localVersion: local.version,
        remoteVersion: latest.current.remote.version,
      });
      latest.current.stampVersion(version);

      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(publishLocal, latest.current.debounceMs);
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
    stampVersion: useCallback((version: number) => {
      useThreadTabsStore.getState().stampSyncVersion(version);
    }, []),
    publish: useCallback(
      (value: typeof remote) => updateClientSettings({ workspaceThreadTabs: value }),
      [updateClientSettings],
    ),
    isEmpty: useCallback(
      (value: typeof remote) => Object.keys(value.byWorkspaceKey).length === 0,
      [],
    ),
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
    stampVersion: useCallback((version: number) => {
      useWorkspaceSidebarStore.getState().stampSyncVersion(version);
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
