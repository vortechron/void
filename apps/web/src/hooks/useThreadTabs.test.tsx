import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import {
  EMPTY_WORKSPACE_THREAD_TABS_STATE,
  openWorkspaceThreadTab,
  useThreadTabsStore,
} from "../threadTabsStore";
import { useThreadTabRouteSync } from "./useThreadTabs";

const shellState = vi.hoisted(() => ({
  bootstrapped: true,
  projectSnapshotsReady: false,
}));

vi.mock("../state/entities", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../state/entities")>()),
  useThreadShells: () => [],
  useAllEnvironmentShellsBootstrapped: () => shellState.bootstrapped,
  useAllEnvironmentProjectSnapshotsReady: () => shellState.projectSnapshotsReady,
}));

const ENVIRONMENT_ID = EnvironmentId.make("test-environment");
const WORKSPACE_KEY = "test-workspace";
const routeRef = scopeThreadRef(ENVIRONMENT_ID, ThreadId.make("route-thread"));
const otherRef = scopeThreadRef(ENVIRONMENT_ID, ThreadId.make("other-thread"));

function Probe() {
  useThreadTabRouteSync({
    environmentId: routeRef.environmentId,
    threadId: routeRef.threadId,
    draftId: null,
    workspaceKey: WORKSPACE_KEY,
  });
  return null;
}

let renderer: ReactTestRenderer | undefined;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  shellState.bootstrapped = true;
  shellState.projectSnapshotsReady = false;
  const seeded = openWorkspaceThreadTab(
    openWorkspaceThreadTab(EMPTY_WORKSPACE_THREAD_TABS_STATE, WORKSPACE_KEY, routeRef, null),
    WORKSPACE_KEY,
    otherRef,
    null,
  );
  useThreadTabsStore.setState(seeded);
});

afterEach(async () => {
  if (renderer) await act(() => renderer?.unmount());
  renderer = undefined;
  vi.unstubAllGlobals();
});

describe("thread tab route sync", () => {
  it("does not remove tabs while the server snapshot is only cached", async () => {
    await act(() => {
      renderer = create(<Probe />);
    });

    expect(
      useThreadTabsStore.getState().byWorkspaceKey[WORKSPACE_KEY]?.tabs.map((tab) => tab.threadId),
    ).toEqual(["route-thread", "other-thread"]);
  });
});
