/**
 * Hiding a repository is a view preference, not a removal: the project keeps
 * its threads, its worktrees and its place in the sort, and comes back through
 * the "Show hidden repositories" shelf at the bottom of the sidebar.
 */

export interface HideableProject {
  readonly projectKey: string;
}

export function partitionSidebarProjects<T extends HideableProject>(
  projects: readonly T[],
  hiddenKeys: readonly string[],
): { readonly listed: readonly T[]; readonly hidden: readonly T[] } {
  if (hiddenKeys.length === 0) return { listed: projects, hidden: [] };
  const hiddenKeySet = new Set(hiddenKeys);
  const listed: T[] = [];
  const hidden: T[] = [];
  for (const project of projects) {
    (hiddenKeySet.has(project.projectKey) ? hidden : listed).push(project);
  }
  return { listed, hidden };
}

export function toggleHiddenProjectKey(
  hiddenKeys: readonly string[],
  projectKey: string,
): readonly string[] {
  return hiddenKeys.includes(projectKey)
    ? hiddenKeys.filter((key) => key !== projectKey)
    : [...hiddenKeys, projectKey];
}

/**
 * Drops keys for projects that no longer exist so a removed-and-re-added
 * repository does not come back invisible.
 */
export function pruneHiddenProjectKeys(
  hiddenKeys: readonly string[],
  knownKeys: ReadonlySet<string>,
): readonly string[] {
  const pruned = hiddenKeys.filter((key) => knownKeys.has(key));
  return pruned.length === hiddenKeys.length ? hiddenKeys : pruned;
}

export function hiddenRepositoriesLabel(count: number, revealed: boolean): string {
  if (revealed) return "Hide hidden repositories";
  return count === 1 ? "Show 1 hidden repository" : `Show ${count} hidden repositories`;
}
