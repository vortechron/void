import {
  resolveSidebarThreadStatus,
  resolveThreadStatusPill,
  type SidebarThreadStatus,
} from "./Sidebar.logic";

export type ThreadAttentionStatus = SidebarThreadStatus | "plan" | "completed";
type ThreadAttentionInput = Parameters<typeof resolveThreadStatusPill>[0]["thread"];

// Monitoring sits just above `ready`: it is calm background presence, not
// progress, so it must never hide a Plan Ready or Completed sibling.
const WORKSPACE_STATUS_PRIORITY: Record<ThreadAttentionStatus, number> = {
  approval: 8,
  input: 7,
  failed: 6,
  working: 5,
  plan: 4,
  completed: 3,
  monitoring: 2,
  ready: 1,
};

export function resolveThreadAttentionStatus(thread: ThreadAttentionInput): ThreadAttentionStatus {
  const liveStatus = resolveSidebarThreadStatus(thread);
  if (liveStatus !== "ready") return liveStatus;

  switch (resolveThreadStatusPill({ thread })?.label) {
    case "Plan Ready":
      return "plan";
    case "Completed":
      return "completed";
    default:
      return "ready";
  }
}

/** One workspace row represents every chat attached to the same checkout. */
export function resolveSidebarWorkspaceStatus(
  threads: readonly ThreadAttentionInput[],
): ThreadAttentionStatus {
  let workspaceStatus: ThreadAttentionStatus = "ready";

  for (const thread of threads) {
    const threadStatus = resolveThreadAttentionStatus(thread);
    if (WORKSPACE_STATUS_PRIORITY[threadStatus] > WORKSPACE_STATUS_PRIORITY[workspaceStatus]) {
      workspaceStatus = threadStatus;
    }
  }

  return workspaceStatus;
}
