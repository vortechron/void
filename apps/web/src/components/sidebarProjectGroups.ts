/**
 * Hand-curated project groups for the sidebar.
 *
 * A group is a named bucket of logical project keys. The header dropdown
 * filters the project list down to one group, and the project right-click
 * menu adds or removes a project from any group. A project may belong to
 * several groups at once, so membership lives on the group rather than on the
 * project.
 *
 * This is a different feature from `SidebarProjectGroupingMode`, which decides
 * whether one repository checked out in several environments collapses into a
 * single sidebar row.
 */

import type { SidebarProjectGroup } from "@t3tools/contracts/settings";

export type { SidebarProjectGroup };

export const ALL_PROJECTS_FILTER_LABEL = "Projects";

export interface GroupableProject {
  readonly projectKey: string;
}

export function resolveActiveProjectGroup(
  groups: readonly SidebarProjectGroup[],
  activeGroupId: string | null,
): SidebarProjectGroup | null {
  if (activeGroupId === null) return null;
  return groups.find((group) => group.id === activeGroupId) ?? null;
}

export function projectGroupFilterLabel(activeGroup: SidebarProjectGroup | null): string {
  return activeGroup?.name ?? ALL_PROJECTS_FILTER_LABEL;
}

/**
 * Filters the sidebar project list to the active group. An unresolved or null
 * group id means "All projects", so a deleted group degrades to the full list
 * instead of an empty sidebar.
 */
export function filterProjectsByGroup<T extends GroupableProject>(
  projects: readonly T[],
  activeGroup: SidebarProjectGroup | null,
): readonly T[] {
  if (activeGroup === null) return projects;
  const memberKeys = new Set(activeGroup.projectKeys);
  return projects.filter((project) => memberKeys.has(project.projectKey));
}

export function groupIdsForProject(
  groups: readonly SidebarProjectGroup[],
  projectKey: string,
): readonly string[] {
  return groups.filter((group) => group.projectKeys.includes(projectKey)).map((group) => group.id);
}

/** Trimmed, non-empty, and not already taken by another group. */
export function isValidProjectGroupName(
  groups: readonly SidebarProjectGroup[],
  name: string,
  options?: { readonly ignoreGroupId?: string },
): boolean {
  const trimmed = name.trim();
  if (trimmed.length === 0) return false;
  return !groups.some(
    (group) =>
      group.id !== options?.ignoreGroupId &&
      group.name.toLocaleLowerCase() === trimmed.toLocaleLowerCase(),
  );
}

/**
 * `id` is supplied by the caller (`randomUUID()` from `lib/utils`) so this
 * stays pure and testable. Returns the list unchanged when the name is not
 * usable.
 */
export function createProjectGroup(
  groups: readonly SidebarProjectGroup[],
  input: { readonly id: string; readonly name: string; readonly projectKeys?: readonly string[] },
): readonly SidebarProjectGroup[] {
  const name = input.name.trim();
  if (!isValidProjectGroupName(groups, name)) return groups;
  if (groups.some((group) => group.id === input.id)) return groups;
  return [...groups, { id: input.id, name, projectKeys: [...(input.projectKeys ?? [])] }];
}

export function renameProjectGroup(
  groups: readonly SidebarProjectGroup[],
  groupId: string,
  name: string,
): readonly SidebarProjectGroup[] {
  if (!groups.some((group) => group.id === groupId)) return groups;
  const trimmed = name.trim();
  if (!isValidProjectGroupName(groups, trimmed, { ignoreGroupId: groupId })) return groups;
  return groups.map((group) => (group.id === groupId ? { ...group, name: trimmed } : group));
}

export function deleteProjectGroup(
  groups: readonly SidebarProjectGroup[],
  groupId: string,
): readonly SidebarProjectGroup[] {
  const next = groups.filter((group) => group.id !== groupId);
  return next.length === groups.length ? groups : next;
}

export function toggleProjectInGroup(
  groups: readonly SidebarProjectGroup[],
  groupId: string,
  projectKey: string,
): readonly SidebarProjectGroup[] {
  if (!groups.some((group) => group.id === groupId)) return groups;
  return groups.map((group) => {
    if (group.id !== groupId) return group;
    return {
      ...group,
      projectKeys: group.projectKeys.includes(projectKey)
        ? group.projectKeys.filter((key) => key !== projectKey)
        : [...group.projectKeys, projectKey],
    };
  });
}

export function projectGroupMemberCountLabel(group: SidebarProjectGroup): string {
  const count = group.projectKeys.length;
  return count === 1 ? "1 project" : `${count} projects`;
}
