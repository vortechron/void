import type { VcsStatusResult } from "@t3tools/contracts";

export interface GitDiffRefreshSnapshot {
  readonly threadKey: string | null;
  /** The latest ready checkpoint's run, so a finished turn refreshes the diff. */
  readonly turnId: string | null;
  readonly gitRevision: string | null;
  readonly hasWorkingTreeChanges: boolean;
}

export function getGitDiffRevision(status: VcsStatusResult | null): string | null {
  if (!status) return null;

  return JSON.stringify({
    refName: status.refName,
    aheadCount: status.aheadCount,
    behindCount: status.behindCount,
    aheadOfDefaultCount: status.aheadOfDefaultCount,
    hasWorkingTreeChanges: status.hasWorkingTreeChanges,
    workingTree: status.workingTree,
  });
}

export function shouldRefreshGitDiffPreview(
  previous: GitDiffRefreshSnapshot | null,
  current: GitDiffRefreshSnapshot,
): boolean {
  if (previous === null || previous.threadKey !== current.threadKey) {
    return current.gitRevision !== null && current.hasWorkingTreeChanges;
  }

  return previous.turnId !== current.turnId || previous.gitRevision !== current.gitRevision;
}
