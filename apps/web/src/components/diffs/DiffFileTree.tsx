import {
  ChevronRightIcon,
  ChevronsDownUpIcon,
  ChevronsUpDownIcon,
  FolderClosedIcon,
  FolderIcon,
  XIcon,
} from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  buildDiffFileTree,
  collectDiffFileTreeAncestorPaths,
  collectDiffFileTreeDirectoryPaths,
  describeDiffFileChange,
  type DiffFileChangeType,
  type DiffFileTreeEntry,
  type DiffFileTreeNode,
} from "~/lib/diffFileTree";
import { cn } from "~/lib/utils";

import { DiffStatLabel, hasNonZeroStat } from "../chat/DiffStatLabel";
import { PierreEntryIcon } from "../chat/PierreEntryIcon";
import { Button } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

const ROW_BASE_PADDING = 6;
const ROW_INDENT = 12;
const GUIDE_OFFSET = 7;
const EMPTY_COLLAPSED_PATHS: ReadonlySet<string> = new Set();

const CHANGE_LETTER_CLASS_NAMES: Record<DiffFileChangeType, string> = {
  new: "text-success",
  deleted: "text-destructive",
  change: "text-warning",
  "rename-pure": "text-muted-foreground",
  "rename-changed": "text-warning",
};

interface DiffFileTreeProps {
  entries: ReadonlyArray<DiffFileTreeEntry>;
  activeFileKey: string | null;
  resolvedTheme: "light" | "dark";
  onSelectFile: (entry: DiffFileTreeEntry) => void;
  /** Renders a dismiss button in the header. Used by the mobile overlay. */
  onClose?: () => void;
  className?: string;
  /** Larger rows for touch targets. */
  touch?: boolean;
}

function IndentGuides(props: { depth: number }) {
  if (props.depth === 0) return null;
  return (
    <>
      {Array.from({ length: props.depth }, (_unused, level) => (
        <span
          key={level}
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 w-px bg-border/70"
          style={{ left: `${ROW_BASE_PADDING + level * ROW_INDENT + GUIDE_OFFSET}px` }}
        />
      ))}
    </>
  );
}

export const DiffFileTree = memo(function DiffFileTree({
  entries,
  activeFileKey,
  resolvedTheme,
  onSelectFile,
  onClose,
  className,
  touch = false,
}: DiffFileTreeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const treeNodes = useMemo(() => buildDiffFileTree(entries), [entries]);
  const directoryPaths = useMemo(() => collectDiffFileTreeDirectoryPaths(treeNodes), [treeNodes]);
  const directoryPathsKey = useMemo(() => directoryPaths.join("\u0000"), [directoryPaths]);
  const [collapsedState, setCollapsedState] = useState<{
    key: string;
    paths: ReadonlySet<string>;
  }>(() => ({ key: directoryPathsKey, paths: EMPTY_COLLAPSED_PATHS }));
  const collapsedPaths =
    collapsedState.key === directoryPathsKey ? collapsedState.paths : EMPTY_COLLAPSED_PATHS;
  const allDirectoriesCollapsed =
    directoryPaths.length > 0 && directoryPaths.every((path) => collapsedPaths.has(path));

  const activeFilePath = useMemo(
    () => entries.find((entry) => entry.fileKey === activeFileKey)?.path ?? null,
    [activeFileKey, entries],
  );

  // Revealing a file from the diff or from chat must not leave it hidden
  // behind a folder the user collapsed earlier.
  useEffect(() => {
    if (!activeFilePath) return;
    const ancestors = collectDiffFileTreeAncestorPaths(activeFilePath);
    setCollapsedState((current) => {
      const currentPaths =
        current.key === directoryPathsKey ? current.paths : EMPTY_COLLAPSED_PATHS;
      if (!ancestors.some((path) => currentPaths.has(path))) {
        return current.key === directoryPathsKey
          ? current
          : { key: directoryPathsKey, paths: EMPTY_COLLAPSED_PATHS };
      }
      const paths = new Set(currentPaths);
      for (const ancestor of ancestors) paths.delete(ancestor);
      return { key: directoryPathsKey, paths };
    });
  }, [activeFilePath, directoryPathsKey]);

  useEffect(() => {
    if (!activeFileKey) return;
    const row = containerRef.current?.querySelector(
      `[data-diff-tree-file="${CSS.escape(activeFileKey)}"]`,
    );
    row?.scrollIntoView({ block: "nearest" });
  }, [activeFileKey]);

  const toggleDirectory = useCallback(
    (path: string) => {
      setCollapsedState((current) => {
        const paths = new Set(current.key === directoryPathsKey ? current.paths : []);
        if (paths.has(path)) {
          paths.delete(path);
        } else {
          paths.add(path);
        }
        return { key: directoryPathsKey, paths };
      });
    },
    [directoryPathsKey],
  );

  const toggleAllDirectories = useCallback(() => {
    setCollapsedState({
      key: directoryPathsKey,
      paths: allDirectoriesCollapsed ? EMPTY_COLLAPSED_PATHS : new Set(directoryPaths),
    });
  }, [allDirectoriesCollapsed, directoryPaths, directoryPathsKey]);

  const renderNode = (node: DiffFileTreeNode, depth: number) => {
    const paddingLeft = `${ROW_BASE_PADDING + depth * ROW_INDENT}px`;

    if (node.kind === "directory") {
      const isExpanded = !collapsedPaths.has(node.path);
      return (
        <div key={`dir:${node.path}`}>
          <div className="relative">
            <IndentGuides depth={depth} />
            <button
              type="button"
              aria-expanded={isExpanded}
              className={cn(
                "group flex w-full items-center gap-1.5 rounded-md pr-2 text-left transition-colors hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                touch ? "py-2" : "py-1",
              )}
              style={{ paddingLeft }}
              onClick={() => toggleDirectory(node.path)}
            >
              <ChevronRightIcon
                aria-hidden="true"
                className={cn(
                  "size-3.5 shrink-0 text-muted-foreground/70 transition-transform group-hover:text-foreground/80",
                  isExpanded && "rotate-90",
                )}
              />
              {isExpanded ? (
                <FolderIcon className="size-3.5 shrink-0 text-muted-foreground/75" />
              ) : (
                <FolderClosedIcon className="size-3.5 shrink-0 text-muted-foreground/75" />
              )}
              <Tooltip>
                <TooltipTrigger
                  render={
                    <span
                      className={cn(
                        "truncate font-mono text-muted-foreground/90 group-hover:text-foreground/90",
                        touch ? "text-[13px]" : "text-[11px]",
                      )}
                    >
                      {node.name}
                    </span>
                  }
                />
                <TooltipPopup side="right" className="max-w-96 font-mono text-[11px]">
                  {node.path}
                </TooltipPopup>
              </Tooltip>
              {!isExpanded && hasNonZeroStat(node.stat) && (
                <span className="ml-auto shrink-0 pl-1 font-mono text-[10px]">
                  <DiffStatLabel
                    additions={node.stat.additions}
                    deletions={node.stat.deletions}
                    layout="inline"
                  />
                </span>
              )}
            </button>
          </div>
          {isExpanded && node.children.map((child) => renderNode(child, depth + 1))}
        </div>
      );
    }

    const isActive = node.entry.fileKey === activeFileKey;
    const change = describeDiffFileChange(node.entry.changeType);
    return (
      <div key={`file:${node.entry.fileKey}`} className="relative">
        <IndentGuides depth={depth} />
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                data-diff-tree-file={node.entry.fileKey}
                aria-current={isActive ? "true" : undefined}
                className={cn(
                  "group flex w-full items-center gap-1.5 rounded-md pr-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  touch ? "py-2" : "py-1",
                  isActive ? "bg-accent text-foreground" : "hover:bg-accent/60",
                )}
                style={{ paddingLeft }}
                onClick={() => onSelectFile(node.entry)}
              >
                <span aria-hidden="true" className="size-3.5 shrink-0" />
                <PierreEntryIcon
                  pathValue={node.path}
                  kind="file"
                  theme={resolvedTheme}
                  className="size-3.5 shrink-0 text-muted-foreground/70"
                />
                <span
                  className={cn(
                    "truncate",
                    touch ? "text-[13px]" : "text-[11px]",
                    isActive
                      ? "text-foreground"
                      : "text-muted-foreground/85 group-hover:text-foreground/90",
                  )}
                >
                  {node.name}
                </span>
                <span className="ml-auto flex shrink-0 items-center gap-1 pl-1">
                  <span
                    aria-label={change.label}
                    className={cn(
                      "font-mono text-[10px] font-medium",
                      CHANGE_LETTER_CLASS_NAMES[node.entry.changeType],
                    )}
                  >
                    {change.letter}
                  </span>
                  <span className="font-mono text-[10px]">
                    <DiffStatLabel
                      additions={node.entry.stat.additions}
                      deletions={node.entry.stat.deletions}
                      layout="inline"
                    />
                  </span>
                </span>
              </button>
            }
          />
          <TooltipPopup side="right" className="max-w-96 font-mono text-[11px]">
            {node.path}
          </TooltipPopup>
        </Tooltip>
      </div>
    );
  };

  return (
    <div className={cn("flex min-h-0 flex-col bg-background/40", className)}>
      <div
        className={cn(
          "flex shrink-0 items-center gap-2 border-b border-border/60 pl-2.5 pr-1.5",
          touch ? "py-1.5" : "py-1",
        )}
      >
        <span
          className={cn(
            "truncate text-muted-foreground",
            touch ? "text-xs font-medium" : "text-[11px]",
          )}
        >
          {entries.length} file{entries.length === 1 ? "" : "s"}
        </span>
        {directoryPaths.length > 0 && (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  size={touch ? "icon-sm" : "icon-xs"}
                  variant="ghost"
                  className="ml-auto"
                  aria-label={
                    allDirectoriesCollapsed ? "Expand all folders" : "Collapse all folders"
                  }
                  onClick={toggleAllDirectories}
                />
              }
            >
              {allDirectoriesCollapsed ? (
                <ChevronsUpDownIcon className={touch ? "size-4" : "size-3"} />
              ) : (
                <ChevronsDownUpIcon className={touch ? "size-4" : "size-3"} />
              )}
            </TooltipTrigger>
            <TooltipPopup side="top">
              {allDirectoriesCollapsed ? "Expand all folders" : "Collapse all folders"}
            </TooltipPopup>
          </Tooltip>
        )}
        {onClose && (
          <Button
            type="button"
            size={touch ? "icon-sm" : "icon-xs"}
            variant="ghost"
            className={directoryPaths.length > 0 ? undefined : "ml-auto"}
            aria-label="Close file tree"
            onClick={onClose}
          >
            <XIcon className={touch ? "size-4" : "size-3"} />
          </Button>
        )}
      </div>
      <div
        ref={containerRef}
        className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden py-1 pr-1"
      >
        {treeNodes.map((node) => renderNode(node, 0))}
      </div>
    </div>
  );
});
