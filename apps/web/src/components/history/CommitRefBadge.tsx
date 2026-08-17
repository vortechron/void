/**
 * A ref decoration chip in the Description column.
 *
 * Remotes render as two segments (`origin | main`) so a remote branch is
 * readable at a glance without the name being repeated on every row.
 */
import type { VcsCommitRef } from "@t3tools/contracts";
import { Archive, GitBranch, Tag } from "lucide-react";
import type { MouseEvent as ReactMouseEvent } from "react";

import { cn } from "~/lib/utils";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";

import { splitRemoteRefName } from "./historyRows";

const KIND_CLASS: Record<VcsCommitRef["kind"], string> = {
  head: "bg-muted text-muted-foreground",
  local: "bg-muted text-foreground",
  remote: "bg-info/15 text-info-foreground",
  tag: "bg-warning/15 text-warning-foreground",
  stash: "bg-accent text-accent-foreground",
};

const KIND_ICON: Record<VcsCommitRef["kind"], typeof GitBranch> = {
  head: GitBranch,
  local: GitBranch,
  remote: GitBranch,
  tag: Tag,
  stash: Archive,
};

export function CommitRefBadge({
  refValue,
  onContextMenu,
}: {
  refValue: VcsCommitRef;
  onContextMenu?: (event: ReactMouseEvent, refValue: VcsCommitRef) => void;
}) {
  const { remote, branch } = splitRemoteRefName(refValue);
  const Icon = KIND_ICON[refValue.kind];

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            className={cn(
              "inline-flex h-4 min-w-0 max-w-52 items-center gap-1 rounded px-1 text-[10px] leading-none",
              KIND_CLASS[refValue.kind],
              refValue.isCurrent && "ring-1 ring-primary/60",
            )}
            onContextMenu={onContextMenu ? (event) => onContextMenu(event, refValue) : undefined}
          >
            <Icon aria-hidden className="size-2.5 shrink-0 opacity-70" />
            {remote ? <span className="shrink-0 opacity-70">{remote}</span> : null}
            <span className="truncate">{branch}</span>
          </span>
        }
      />
      <TooltipPopup side="top">{refValue.name}</TooltipPopup>
    </Tooltip>
  );
}
