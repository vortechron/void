import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import type { WorkspaceThreadTabsSettings } from "@t3tools/contracts/settings";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { act, render, type Screen } from "../../test/render";

import {
  EMPTY_WORKSPACE_THREAD_TABS_STATE,
  openWorkspaceThreadTab,
  selectSyncableWorkspaceThreadTabs,
  threadTabKey,
  useThreadTabsStore,
} from "../threadTabsStore";
import { useWorkspaceServerSync } from "./useWorkspaceServerSync";

const server = vi.hoisted(() => ({
  settings: {} as Record<string, unknown>,
  published: [] as Array<Record<string, unknown>>,
  connected: true,
}));

vi.mock("../state/environments", () => ({
  usePrimaryEnvironment: () => ({
    connection: { phase: server.connected ? "connected" : "connecting" },
  }),
}));

vi.mock("./useSettings", () => ({
  useClientSettingsHydrated: () => true,
  useClientSettings: (selector: (settings: Record<string, unknown>) => unknown) =>
    selector(server.settings),
  useUpdateClientSettings: () => (patch: Record<string, unknown>) => {
    server.published.push(patch);
  },
}));

const ENVIRONMENT_ID = EnvironmentId.make("test-environment");
const WORKSPACE_KEY = "test-workspace";
const EMPTY_SIDEBAR = {
  version: 0,
  namesByWorkspaceKey: {},
  pinnedWorkspaceKeys: [],
  archivedWorkspaceKeys: [],
};

function openSet(version: number, threadIds: readonly string[]): WorkspaceThreadTabsSettings {
  return {
    version,
    byWorkspaceKey: {
      [WORKSPACE_KEY]: threadIds.map((threadId) => ({
        environmentId: ENVIRONMENT_ID,
        threadId,
        groupId: null,
      })),
    },
    groupsByWorkspaceKey: {},
  };
}

function Probe() {
  useWorkspaceServerSync();
  return null;
}

let screen: Screen | undefined;

async function receiveFromServer(workspaceThreadTabs: WorkspaceThreadTabsSettings) {
  server.settings = { ...server.settings, workspaceThreadTabs };
  await screen?.rerender(<Probe />);
}

beforeEach(() => {
  vi.useFakeTimers();
  const opened = ["a", "b", "c"].reduce(
    (state, threadId) =>
      openWorkspaceThreadTab(
        state,
        WORKSPACE_KEY,
        scopeThreadRef(ENVIRONMENT_ID, ThreadId.make(threadId)),
        null,
      ),
    EMPTY_WORKSPACE_THREAD_TABS_STATE,
  );
  useThreadTabsStore.setState({ ...opened, syncVersion: 5 });
  server.settings = {
    workspaceThreadTabs: openSet(5, ["a", "b", "c"]),
    workspaceSidebar: EMPTY_SIDEBAR,
  };
  server.published = [];
  server.connected = true;
});

afterEach(async () => {
  await screen?.[Symbol.asyncDispose]();
  screen = undefined;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("workspace server sync", () => {
  it("keeps closes made on another device while this device's timers are delayed", async () => {
    screen = await render(<Probe />, { router: false });

    // The tablet closes b, then c. Both land before this device's debounce
    // fires, as they do when a background browser tab throttles its timers.
    await receiveFromServer(openSet(6, ["a", "c"]));
    await receiveFromServer(openSet(7, ["a"]));
    await act(() => vi.runAllTimersAsync());

    expect(server.published).toEqual([]);
    expect(selectSyncableWorkspaceThreadTabs(useThreadTabsStore.getState())).toEqual(
      openSet(7, ["a"]),
    );
  });

  it("publishes a close made on this device past the server's version", async () => {
    screen = await render(<Probe />, { router: false });

    await act(() => {
      useThreadTabsStore
        .getState()
        .closeTab(WORKSPACE_KEY, threadTabKey(scopeThreadRef(ENVIRONMENT_ID, ThreadId.make("b"))));
    });
    await act(() => vi.runAllTimersAsync());

    expect(server.published).toEqual([{ workspaceThreadTabs: openSet(6, ["a", "c"]) }]);
  });

  it("holds a close made before the connection is up and sends it once connected", async () => {
    server.connected = false;
    screen = await render(<Probe />, { router: false });

    await act(() => {
      useThreadTabsStore
        .getState()
        .closeTab(WORKSPACE_KEY, threadTabKey(scopeThreadRef(ENVIRONMENT_ID, ThreadId.make("b"))));
    });
    await act(() => vi.runAllTimersAsync());
    expect(server.published).toEqual([]);

    server.connected = true;
    await screen?.rerender(<Probe />);

    expect(server.published).toHaveLength(1);
    const sent = server.published[0]?.workspaceThreadTabs as WorkspaceThreadTabsSettings;
    expect(sent.byWorkspaceKey).toEqual(openSet(0, ["a", "c"]).byWorkspaceKey);
    expect(sent.version).toBeGreaterThan(5);
  });
});
