import type { SidebarThreadSummary } from "../types";
import { describe, expect, it } from "vite-plus/test";

import { resolveSidebarWorkspaceStatus } from "./sidebarWorkspaceStatus";

function thread(input: {
  status?: "error" | "ready" | "running" | "starting" | "stopped";
  hasPendingApprovals?: boolean;
  hasPendingUserInput?: boolean;
}): Pick<SidebarThreadSummary, "hasPendingApprovals" | "hasPendingUserInput" | "session"> {
  return {
    hasPendingApprovals: input.hasPendingApprovals ?? false,
    hasPendingUserInput: input.hasPendingUserInput ?? false,
    session: input.status
      ? ({ status: input.status, activeTurnId: null } as SidebarThreadSummary["session"])
      : null,
  };
}

describe("resolveSidebarWorkspaceStatus", () => {
  it("uses the loading state while any chat in the workspace is working", () => {
    expect(
      resolveSidebarWorkspaceStatus([thread({ status: "ready" }), thread({ status: "running" })]),
    ).toBe("working");
    expect(resolveSidebarWorkspaceStatus([thread({ status: "starting" })])).toBe("working");
  });

  it("prioritizes states that need user attention", () => {
    expect(
      resolveSidebarWorkspaceStatus([
        thread({ status: "running" }),
        thread({ hasPendingUserInput: true }),
        thread({ hasPendingApprovals: true }),
      ]),
    ).toBe("approval");
  });

  it("shows failures when no chat is active or waiting on the user", () => {
    expect(
      resolveSidebarWorkspaceStatus([thread({ status: "ready" }), thread({ status: "error" })]),
    ).toBe("failed");
  });

  it("defaults to the branch state for an idle or empty workspace", () => {
    expect(resolveSidebarWorkspaceStatus([thread({ status: "stopped" })])).toBe("ready");
    expect(resolveSidebarWorkspaceStatus([])).toBe("ready");
  });
});
