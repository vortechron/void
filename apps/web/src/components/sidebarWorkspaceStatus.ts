import {
  resolveSidebarV2Status,
  resolveThreadStatusPill,
  type SidebarV2Status,
} from "./Sidebar.logic";

export type ThreadAttentionStatus = SidebarV2Status | "plan" | "completed";
type ThreadAttentionInput = Parameters<typeof resolveThreadStatusPill>[0]["thread"];

const WORKSPACE_STATUS_PRIORITY: Record<ThreadAttentionStatus, number> = {
  approval: 7,
  input: 6,
  failed: 5,
  working: 4,
  plan: 3,
  completed: 2,
  ready: 1,
};

export function resolveThreadAttentionStatus(thread: ThreadAttentionInput): ThreadAttentionStatus {
  const liveStatus = resolveSidebarV2Status(thread);
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
