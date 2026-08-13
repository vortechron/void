import { describe, expect, it } from "vite-plus/test";

import {
  createProjectGroup,
  deleteProjectGroup,
  filterProjectsByGroup,
  groupIdsForProject,
  isValidProjectGroupName,
  projectGroupFilterLabel,
  projectGroupMemberCountLabel,
  renameProjectGroup,
  resolveActiveProjectGroup,
  type SidebarProjectGroup,
  toggleProjectInGroup,
} from "./sidebarProjectGroups";

const groups: readonly SidebarProjectGroup[] = [
  { id: "g1", name: "Work", projectKeys: ["a", "b"] },
  { id: "g2", name: "Side", projectKeys: ["b", "c"] },
];

const projects = [{ projectKey: "a" }, { projectKey: "b" }, { projectKey: "c" }];

describe("resolveActiveProjectGroup", () => {
  it("returns the matching group", () => {
    expect(resolveActiveProjectGroup(groups, "g2")?.name).toBe("Side");
  });

  it("returns null for the all-projects filter", () => {
    expect(resolveActiveProjectGroup(groups, null)).toBeNull();
  });

  it("returns null when the group no longer exists", () => {
    expect(resolveActiveProjectGroup(groups, "deleted")).toBeNull();
  });
});

describe("projectGroupFilterLabel", () => {
  it("falls back to the section title when no group is active", () => {
    expect(projectGroupFilterLabel(null)).toBe("Projects");
  });

  it("uses the group name when one is active", () => {
    expect(projectGroupFilterLabel(groups[0]!)).toBe("Work");
  });
});

describe("filterProjectsByGroup", () => {
  it("keeps only group members, in sidebar order", () => {
    const filtered = filterProjectsByGroup(projects, groups[1]!);
    expect(filtered.map((project) => project.projectKey)).toEqual(["b", "c"]);
  });

  it("returns the original array for the all-projects filter", () => {
    expect(filterProjectsByGroup(projects, null)).toBe(projects);
  });

  it("ignores member keys for projects that are not listed", () => {
    const group: SidebarProjectGroup = { id: "g3", name: "Ghost", projectKeys: ["zzz"] };
    expect(filterProjectsByGroup(projects, group)).toEqual([]);
  });
});

describe("groupIdsForProject", () => {
  it("reports every group a project belongs to", () => {
    expect(groupIdsForProject(groups, "b")).toEqual(["g1", "g2"]);
  });

  it("reports nothing for an ungrouped project", () => {
    expect(groupIdsForProject(groups, "zzz")).toEqual([]);
  });
});

describe("isValidProjectGroupName", () => {
  it("rejects blank names", () => {
    expect(isValidProjectGroupName(groups, "   ")).toBe(false);
  });

  it("rejects duplicates regardless of case or padding", () => {
    expect(isValidProjectGroupName(groups, "  work ")).toBe(false);
  });

  it("allows a group to keep its own name while renaming", () => {
    expect(isValidProjectGroupName(groups, "Work", { ignoreGroupId: "g1" })).toBe(true);
  });
});

describe("createProjectGroup", () => {
  it("appends a trimmed group", () => {
    const next = createProjectGroup(groups, { id: "g3", name: "  Clients  " });
    expect(next).toHaveLength(3);
    expect(next[2]).toEqual({ id: "g3", name: "Clients", projectKeys: [] });
  });

  it("seeds membership when asked", () => {
    const next = createProjectGroup([], { id: "g1", name: "Work", projectKeys: ["a"] });
    expect(next[0]?.projectKeys).toEqual(["a"]);
  });

  it("refuses a duplicate name", () => {
    expect(createProjectGroup(groups, { id: "g3", name: "Work" })).toBe(groups);
  });

  it("refuses a duplicate id", () => {
    expect(createProjectGroup(groups, { id: "g1", name: "Unique" })).toBe(groups);
  });
});

describe("renameProjectGroup", () => {
  it("renames in place", () => {
    const next = renameProjectGroup(groups, "g1", " Day job ");
    expect(next[0]).toEqual({ id: "g1", name: "Day job", projectKeys: ["a", "b"] });
  });

  it("refuses a name another group already uses", () => {
    expect(renameProjectGroup(groups, "g1", "Side")).toBe(groups);
  });

  it("refuses a blank name", () => {
    expect(renameProjectGroup(groups, "g1", "  ")).toBe(groups);
  });

  it("returns the original list when the group no longer exists", () => {
    expect(renameProjectGroup(groups, "missing", "New name")).toBe(groups);
  });
});

describe("deleteProjectGroup", () => {
  it("drops the group", () => {
    expect(deleteProjectGroup(groups, "g1").map((group) => group.id)).toEqual(["g2"]);
  });

  it("returns the original list when nothing matches", () => {
    expect(deleteProjectGroup(groups, "nope")).toBe(groups);
  });
});

describe("toggleProjectInGroup", () => {
  it("adds a project that is not a member yet", () => {
    expect(toggleProjectInGroup(groups, "g1", "c")[0]?.projectKeys).toEqual(["a", "b", "c"]);
  });

  it("removes a project that is already a member", () => {
    expect(toggleProjectInGroup(groups, "g1", "a")[0]?.projectKeys).toEqual(["b"]);
  });

  it("leaves the other groups alone, so a project can stay in several", () => {
    const next = toggleProjectInGroup(groups, "g1", "b");
    expect(next[0]?.projectKeys).toEqual(["a"]);
    expect(next[1]?.projectKeys).toEqual(["b", "c"]);
  });

  it("returns the original list when the group no longer exists", () => {
    expect(toggleProjectInGroup(groups, "missing", "a")).toBe(groups);
  });
});

describe("projectGroupMemberCountLabel", () => {
  it("singularizes one project", () => {
    expect(projectGroupMemberCountLabel({ id: "g", name: "n", projectKeys: ["a"] })).toBe(
      "1 project",
    );
  });

  it("pluralizes zero and many", () => {
    expect(projectGroupMemberCountLabel({ id: "g", name: "n", projectKeys: [] })).toBe(
      "0 projects",
    );
    expect(projectGroupMemberCountLabel(groups[0]!)).toBe("2 projects");
  });
});
