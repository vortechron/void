/**
 * Groups the flat file list of a rendered patch into a directory tree so the
 * diff panel can offer a tree navigator next to the stacked diffs.
 */

/** Mirrors `ChangeTypes` from `@pierre/diffs` without importing its types. */
export type DiffFileChangeType = "change" | "rename-pure" | "rename-changed" | "new" | "deleted";

export interface DiffFileTreeStat {
  readonly additions: number;
  readonly deletions: number;
}

export interface DiffFileTreeEntry {
  /** Stable id of the rendered diff item, used to scroll the diff into view. */
  readonly fileKey: string;
  readonly path: string;
  readonly changeType: DiffFileChangeType;
  readonly stat: DiffFileTreeStat;
}

export interface DiffFileTreeFileNode {
  readonly kind: "file";
  readonly name: string;
  readonly path: string;
  readonly entry: DiffFileTreeEntry;
}

export interface DiffFileTreeDirectoryNode {
  readonly kind: "directory";
  readonly name: string;
  readonly path: string;
  readonly stat: DiffFileTreeStat;
  readonly fileCount: number;
  readonly children: ReadonlyArray<DiffFileTreeNode>;
}

export type DiffFileTreeNode = DiffFileTreeDirectoryNode | DiffFileTreeFileNode;

interface MutableDirectory {
  name: string;
  path: string;
  additions: number;
  deletions: number;
  fileCount: number;
  directories: Map<string, MutableDirectory>;
  files: DiffFileTreeFileNode[];
}

const SORT_LOCALE_OPTIONS: Intl.CollatorOptions = { numeric: true, sensitivity: "base" };

const CHANGE_DESCRIPTIONS: Record<DiffFileChangeType, { letter: string; label: string }> = {
  new: { letter: "A", label: "Added" },
  deleted: { letter: "D", label: "Deleted" },
  change: { letter: "M", label: "Modified" },
  "rename-pure": { letter: "R", label: "Renamed" },
  "rename-changed": { letter: "R", label: "Renamed" },
};

export function describeDiffFileChange(changeType: DiffFileChangeType): {
  letter: string;
  label: string;
} {
  return CHANGE_DESCRIPTIONS[changeType] ?? CHANGE_DESCRIPTIONS.change;
}

function normalizePathSegments(pathValue: string): string[] {
  return pathValue
    .replaceAll("\\", "/")
    .split("/")
    .filter((segment) => segment.length > 0);
}

function compareByName(a: { name: string }, b: { name: string }): number {
  return a.name.localeCompare(b.name, undefined, SORT_LOCALE_OPTIONS);
}

function createDirectory(name: string, path: string): MutableDirectory {
  return {
    name,
    path,
    additions: 0,
    deletions: 0,
    fileCount: 0,
    directories: new Map(),
    files: [],
  };
}

/**
 * Folds directories that only hold a single subdirectory into one row, so deep
 * single-child chains such as `app/Console/Commands` stay on one line.
 */
function compactDirectory(node: DiffFileTreeDirectoryNode): DiffFileTreeDirectoryNode {
  const onlyChild = node.children.length === 1 ? node.children[0] : undefined;
  if (!onlyChild || onlyChild.kind !== "directory") {
    return node;
  }
  return compactDirectory({
    kind: "directory",
    name: `${node.name}/${onlyChild.name}`,
    path: onlyChild.path,
    stat: onlyChild.stat,
    fileCount: onlyChild.fileCount,
    children: onlyChild.children,
  });
}

function toTreeNodes(directory: MutableDirectory): DiffFileTreeNode[] {
  const subdirectories = Array.from(directory.directories.values())
    .toSorted(compareByName)
    .map((subdirectory) =>
      compactDirectory({
        kind: "directory",
        name: subdirectory.name,
        path: subdirectory.path,
        stat: { additions: subdirectory.additions, deletions: subdirectory.deletions },
        fileCount: subdirectory.fileCount,
        children: toTreeNodes(subdirectory),
      }),
    );

  return [...subdirectories, ...directory.files.toSorted(compareByName)];
}

export function buildDiffFileTree(entries: ReadonlyArray<DiffFileTreeEntry>): DiffFileTreeNode[] {
  const root = createDirectory("", "");

  for (const entry of entries) {
    const segments = normalizePathSegments(entry.path);
    const fileName = segments.at(-1);
    if (!fileName) continue;

    const ancestors: MutableDirectory[] = [root];
    let currentDirectory = root;
    for (const segment of segments.slice(0, -1)) {
      const nextPath = currentDirectory.path ? `${currentDirectory.path}/${segment}` : segment;
      const existing = currentDirectory.directories.get(segment);
      if (existing) {
        currentDirectory = existing;
      } else {
        const created = createDirectory(segment, nextPath);
        currentDirectory.directories.set(segment, created);
        currentDirectory = created;
      }
      ancestors.push(currentDirectory);
    }

    currentDirectory.files.push({
      kind: "file",
      name: fileName,
      path: segments.join("/"),
      entry,
    });

    for (const ancestor of ancestors) {
      ancestor.additions += entry.stat.additions;
      ancestor.deletions += entry.stat.deletions;
      ancestor.fileCount += 1;
    }
  }

  return toTreeNodes(root);
}

export function collectDiffFileTreeDirectoryPaths(
  nodes: ReadonlyArray<DiffFileTreeNode>,
): string[] {
  return nodes.flatMap((node) =>
    node.kind === "directory"
      ? [node.path, ...collectDiffFileTreeDirectoryPaths(node.children)]
      : [],
  );
}

/** Directory paths that must be open for `filePath` to be visible in the tree. */
export function collectDiffFileTreeAncestorPaths(filePath: string): string[] {
  const segments = normalizePathSegments(filePath).slice(0, -1);
  return segments.map((_segment, index) => segments.slice(0, index + 1).join("/"));
}
