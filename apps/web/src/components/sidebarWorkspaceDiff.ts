/** Diff stat owned by one physical checkout (base checkout or linked worktree). */
export interface WorkspaceDiffStat {
  readonly additions: number;
  readonly deletions: number;
}

interface WorkingTreeStat {
  readonly insertions: number;
  readonly deletions: number;
}

export function resolveSidebarWorkspaceDiffStat(input: {
  readonly workingTree: WorkingTreeStat | null | undefined;
}): WorkspaceDiffStat | null {
  if (!input.workingTree) return null;
  const additions = input.workingTree.insertions;
  const deletions = input.workingTree.deletions;
  if (additions <= 0 && deletions <= 0) return null;
  return { additions, deletions };
}
