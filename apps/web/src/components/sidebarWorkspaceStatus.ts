import type { SidebarThreadSummary } from "../types";
import { resolveSidebarV2Status, type SidebarV2Status } from "./Sidebar.logic";

type WorkspaceStatusThread = Pick<
  SidebarThreadSummary,
  "hasPendingApprovals" | "hasPendingUserInput" | "session"
>;

const WORKSPACE_STATUS_PRIORITY: Record<SidebarV2Status, number> = {
  approval: 5,
  input: 4,
  working: 3,
  failed: 2,
  ready: 1,
};

/** One workspace row represents every chat attached to the same checkout. */
export function resolveSidebarWorkspaceStatus(
  threads: readonly WorkspaceStatusThread[],
): SidebarV2Status {
  let workspaceStatus: SidebarV2Status = "ready";

  for (const thread of threads) {
    const threadStatus = resolveSidebarV2Status(thread);
    if (WORKSPACE_STATUS_PRIORITY[threadStatus] > WORKSPACE_STATUS_PRIORITY[workspaceStatus]) {
      workspaceStatus = threadStatus;
    }
  }

  return workspaceStatus;
}
