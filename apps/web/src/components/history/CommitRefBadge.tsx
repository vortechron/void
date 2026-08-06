/**
 * A ref decoration chip in the Description column.
 *
 * Remotes render as two segments (`origin | main`) so a remote branch is
 * readable at a glance without the name being repeated on every row.
 */
import type { VcsCommitRef } from "@t3tools/contracts";
import { GitBranch, Tag } from "lucide-react";
import type { MouseEvent as ReactMouseEvent } from "react";

import { cn } from "~/lib/utils";

import { splitRemoteRefName } from "./historyRows";

const KIND_CLASS: Record<VcsCommitRef["kind"], string> = {
  head: "bg-muted text-muted-foreground",
  local: "bg-muted text-foreground",
  remote: "bg-info/15 text-info-foreground",
  tag: "bg-warning/15 text-warning-foreground",
};

export function CommitRefBadge({
  refValue,
  onContextMenu,
}: {
  refValue: VcsCommitRef;
  onContextMenu?: (event: ReactMouseEvent, refValue: VcsCommitRef) => void;
}) {
  const { remote, branch } = splitRemoteRefName(refValue);
  const Icon = refValue.kind === "tag" ? Tag : GitBranch;

  return (
    <span
      className={cn(
        "inline-flex h-4 max-w-52 shrink-0 items-center gap-1 rounded px-1 text-[10px] leading-none",
        KIND_CLASS[refValue.kind],
        refValue.isCurrent && "ring-1 ring-primary/60",
      )}
      onContextMenu={onContextMenu ? (event) => onContextMenu(event, refValue) : undefined}
      title={refValue.name}
    >
      <Icon aria-hidden className="size-2.5 shrink-0 opacity-70" />
      {remote ? <span className="shrink-0 opacity-70">{remote}</span> : null}
      <span className="truncate">{branch}</span>
    </span>
  );
}
