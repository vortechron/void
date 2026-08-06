import { describe, expect, it } from "vite-plus/test";

import {
  buildDiffFileTree,
  collectDiffFileTreeAncestorPaths,
  collectDiffFileTreeDirectoryPaths,
  describeDiffFileChange,
  type DiffFileChangeType,
  type DiffFileTreeEntry,
} from "./diffFileTree";

function entry(
  path: string,
  additions = 0,
  deletions = 0,
  changeType: DiffFileChangeType = "change",
): DiffFileTreeEntry {
  return { fileKey: `key:${path}`, path, changeType, stat: { additions, deletions } };
}

describe("buildDiffFileTree", () => {
  it("groups files by directory and keeps directories before files", () => {
    const tree = buildDiffFileTree([
      entry("readme.md"),
      entry("src/app.ts"),
      entry("src/utils/format.ts"),
    ]);

    expect(tree.map((node) => `${node.kind}:${node.path}`)).toEqual([
      "directory:src",
      "file:readme.md",
    ]);
    const src = tree[0];
    if (src?.kind !== "directory") throw new Error("expected a directory node");
    expect(src.children.map((node) => `${node.kind}:${node.path}`)).toEqual([
      "directory:src/utils",
      "file:src/app.ts",
    ]);
  });

  it("compacts directories that only contain a single subdirectory", () => {
    const tree = buildDiffFileTree([entry("app/Console/Commands/Events/Show.php")]);

    expect(tree).toHaveLength(1);
    const node = tree[0];
    if (node?.kind !== "directory") throw new Error("expected a directory node");
    expect(node.name).toBe("app/Console/Commands/Events");
    expect(node.path).toBe("app/Console/Commands/Events");
    expect(node.children.map((child) => child.path)).toEqual([
      "app/Console/Commands/Events/Show.php",
    ]);
  });

  it("stops compacting once a directory holds more than one child", () => {
    const tree = buildDiffFileTree([entry("app/Events/Cadence/A.php"), entry("app/Events/B.php")]);

    const app = tree[0];
    if (app?.kind !== "directory") throw new Error("expected a directory node");
    expect(app.name).toBe("app/Events");
    expect(app.children.map((child) => `${child.kind}:${child.name}`)).toEqual([
      "directory:Cadence",
      "file:B.php",
    ]);
  });

  it("sums additions, deletions and file counts onto every ancestor directory", () => {
    const tree = buildDiffFileTree([
      entry("src/app.ts", 10, 2),
      entry("src/utils/format.ts", 5, 1),
      entry("src/utils/parse.ts", 3, 0),
    ]);

    const src = tree[0];
    if (src?.kind !== "directory") throw new Error("expected a directory node");
    expect(src.stat).toEqual({ additions: 18, deletions: 3 });
    expect(src.fileCount).toBe(3);

    const utils = src.children[0];
    if (utils?.kind !== "directory") throw new Error("expected a directory node");
    expect(utils.stat).toEqual({ additions: 8, deletions: 1 });
    expect(utils.fileCount).toBe(2);
  });

  it("normalizes windows separators and ignores empty paths", () => {
    const tree = buildDiffFileTree([entry("src\\lib\\a.ts"), entry("")]);

    expect(collectDiffFileTreeDirectoryPaths(tree)).toEqual(["src/lib"]);
  });

  it("keeps the original entry on file nodes so the diff can be revealed", () => {
    const tree = buildDiffFileTree([entry("src/app.ts", 4, 0, "new")]);

    const src = tree[0];
    if (src?.kind !== "directory") throw new Error("expected a directory node");
    const file = src.children[0];
    if (file?.kind !== "file") throw new Error("expected a file node");
    expect(file.entry.fileKey).toBe("key:src/app.ts");
    expect(file.entry.changeType).toBe("new");
  });
});

describe("collectDiffFileTreeDirectoryPaths", () => {
  it("lists every directory path depth first", () => {
    const tree = buildDiffFileTree([
      entry("src/app.ts"),
      entry("src/utils/format.ts"),
      entry("docs/readme.md"),
      entry("docs/guides/start.md"),
    ]);

    expect(collectDiffFileTreeDirectoryPaths(tree)).toEqual([
      "docs",
      "docs/guides",
      "src",
      "src/utils",
    ]);
  });
});

describe("collectDiffFileTreeAncestorPaths", () => {
  it("returns each parent directory of a file path", () => {
    expect(collectDiffFileTreeAncestorPaths("app/Events/Cadence/Note.php")).toEqual([
      "app",
      "app/Events",
      "app/Events/Cadence",
    ]);
  });

  it("returns nothing for a root level file", () => {
    expect(collectDiffFileTreeAncestorPaths("readme.md")).toEqual([]);
  });
});

describe("describeDiffFileChange", () => {
  it("maps change types to a single letter badge", () => {
    expect(describeDiffFileChange("new")).toEqual({ letter: "A", label: "Added" });
    expect(describeDiffFileChange("deleted")).toEqual({ letter: "D", label: "Deleted" });
    expect(describeDiffFileChange("change")).toEqual({ letter: "M", label: "Modified" });
    expect(describeDiffFileChange("rename-pure")).toEqual({ letter: "R", label: "Renamed" });
    expect(describeDiffFileChange("rename-changed")).toEqual({ letter: "R", label: "Renamed" });
  });
});
