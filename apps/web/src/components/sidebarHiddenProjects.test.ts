import { describe, expect, it } from "vite-plus/test";

import {
  hiddenRepositoriesLabel,
  partitionSidebarProjects,
  pruneHiddenProjectKeys,
  toggleHiddenProjectKey,
} from "./sidebarHiddenProjects";

const projects = [{ projectKey: "a" }, { projectKey: "b" }, { projectKey: "c" }];

describe("partitionSidebarProjects", () => {
  it("splits hidden projects out while preserving sort order", () => {
    const { listed, hidden } = partitionSidebarProjects(projects, ["b"]);
    expect(listed.map((project) => project.projectKey)).toEqual(["a", "c"]);
    expect(hidden.map((project) => project.projectKey)).toEqual(["b"]);
  });

  it("returns the original array when nothing is hidden", () => {
    const { listed, hidden } = partitionSidebarProjects(projects, []);
    expect(listed).toBe(projects);
    expect(hidden).toEqual([]);
  });

  it("ignores keys for projects that are not listed", () => {
    const { listed, hidden } = partitionSidebarProjects(projects, ["zzz"]);
    expect(listed.map((project) => project.projectKey)).toEqual(["a", "b", "c"]);
    expect(hidden).toEqual([]);
  });
});

describe("toggleHiddenProjectKey", () => {
  it("hides a visible project", () => {
    expect(toggleHiddenProjectKey(["a"], "b")).toEqual(["a", "b"]);
  });

  it("reveals a hidden project", () => {
    expect(toggleHiddenProjectKey(["a", "b"], "a")).toEqual(["b"]);
  });
});

describe("pruneHiddenProjectKeys", () => {
  it("drops keys whose project is gone", () => {
    expect(pruneHiddenProjectKeys(["a", "gone"], new Set(["a", "b"]))).toEqual(["a"]);
  });

  it("returns the same array when every key still resolves", () => {
    const keys = ["a", "b"];
    expect(pruneHiddenProjectKeys(keys, new Set(["a", "b", "c"]))).toBe(keys);
  });
});

describe("hiddenRepositoriesLabel", () => {
  it("reads naturally at one and many", () => {
    expect(hiddenRepositoriesLabel(1, false)).toBe("Show 1 hidden repository");
    expect(hiddenRepositoriesLabel(3, false)).toBe("Show 3 hidden repositories");
  });

  it("offers the way back out once revealed", () => {
    expect(hiddenRepositoriesLabel(3, true)).toBe("Hide hidden repositories");
  });
});
