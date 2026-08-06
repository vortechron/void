/**
 * History right-panel surface: the repository's commit graph.
 *
 * The panel is deliberately read-mostly. It answers "what landed, on which
 * branch, by whom", offers checkout and copy from a right-click, and hands the
 * commit off to the diff surface for anything deeper. Mutating branch actions
 * (merge, delete remote, pull into branch) are not here yet.
 */
import { ContextMenu } from "@base-ui/react/context-menu";
import type { EnvironmentId, VcsCommitRef } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import { GitBranch, RotateCw } from "lucide-react";
import { type MouseEvent as ReactMouseEvent, useCallback, useMemo, useState } from "react";

import { useClientSettings } from "~/hooks/useSettings";
import { writeTextToClipboard } from "~/hooks/useCopyToClipboard";
import { cn } from "~/lib/utils";
import { useAtomCommand } from "~/state/use-atom-command";
import { useEnvironmentQuery } from "~/state/query";
import { vcsEnvironment } from "~/state/vcs";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { MenuItem, MenuPopup, MenuSeparator } from "~/components/ui/menu";
import { ScrollArea } from "~/components/ui/scroll-area";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { toastManager } from "~/components/ui/toast";

import { CommitRefBadge } from "./CommitRefBadge";
import { GRAPH_LANE_WIDTH, GRAPH_ROW_HEIGHT, GitGraphColumn } from "./GitGraphColumn";
import { buildHistoryView, checkoutRefName, formatCommitDate, sortCommitRefs } from "./historyRows";

const HISTORY_PAGE_SIZE = 100;
const HISTORY_MAX_COMMITS = 500;
const BRANCH_LIST_LIMIT = 100;
const ALL_BRANCHES = "__all__";

export interface GitHistoryCommitTarget {
  readonly sha: string;
  readonly shortSha: string;
  readonly subject: string;
}

interface ContextTarget {
  readonly commitSha: string | null;
  readonly commitSubject: string | null;
  readonly refValue: VcsCommitRef | null;
}

function readContextTarget(element: HTMLElement | null): ContextTarget {
  const row = element?.closest<HTMLElement>("[data-commit-sha]") ?? null;
  const badge = element?.closest<HTMLElement>("[data-ref-name]") ?? null;
  const refName = badge?.dataset.refName ?? null;
  const refKind = badge?.dataset.refKind as VcsCommitRef["kind"] | undefined;
  return {
    commitSha: row?.dataset.commitSha ?? null,
    commitSubject: row?.dataset.commitSubject ?? null,
    refValue:
      refName && refKind
        ? {
            name: refName,
            kind: refKind,
            isCurrent: badge?.dataset.refCurrent === "true",
            ...(badge?.dataset.refRemote ? { remoteName: badge.dataset.refRemote } : {}),
          }
        : null,
  };
}

function copyOrWarn(value: string, label: string) {
  void writeTextToClipboard(value, label).catch(() => {
    toastManager.add({ type: "error", title: `Failed to copy the ${label}.` });
  });
}

export function GitHistoryPanel({
  environmentId,
  cwd,
  onOpenCommit,
}: {
  environmentId: EnvironmentId;
  cwd: string;
  onOpenCommit: (commit: GitHistoryCommitTarget) => void;
}) {
  const { timestampFormat } = useClientSettings();
  const [refFilter, setRefFilter] = useState<string | null>(null);
  const [includeRemotes, setIncludeRemotes] = useState(true);
  const [limit, setLimit] = useState(HISTORY_PAGE_SIZE);
  const [selectedSha, setSelectedSha] = useState<string | null>(null);
  const [contextTarget, setContextTarget] = useState<ContextTarget | null>(null);

  const commitsQuery = useEnvironmentQuery(
    vcsEnvironment.listCommits({
      environmentId,
      input: {
        cwd,
        limit,
        ...(refFilter ? { refName: refFilter } : {}),
        ...(includeRemotes ? { includeRemotes: true } : {}),
      },
    }),
  );
  const branchesQuery = useEnvironmentQuery(
    vcsEnvironment.listRefs({ environmentId, input: { cwd, limit: BRANCH_LIST_LIMIT } }),
  );
  const switchRef = useAtomCommand(vcsEnvironment.switchRef, { reportFailure: false });

  const view = useMemo(() => buildHistoryView(commitsQuery.data), [commitsQuery.data]);
  const graphWidth = Math.max(view.graph.laneCount, 1) * GRAPH_LANE_WIDTH;
  const canLoadMore = commitsQuery.data?.nextCursor != null && limit < HISTORY_MAX_COMMITS;

  const refresh = commitsQuery.refresh;
  const checkout = useCallback(
    async (refName: string) => {
      const outcome = await switchRef({ environmentId, input: { cwd, refName } });
      if (outcome._tag === "Success") {
        refresh();
        return;
      }
      toastManager.add({ type: "error", title: `Failed to check out ${refName}.` });
    },
    [cwd, environmentId, refresh, switchRef],
  );

  const handleContextMenu = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    setContextTarget(readContextTarget(event.target as HTMLElement | null));
  }, []);

  if (commitsQuery.data && !commitsQuery.data.isRepo) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
        <GitBranch aria-hidden className="size-6 text-muted-foreground/60" />
        <p className="text-sm font-medium">Not a Git repository</p>
        <p className="max-w-56 text-xs text-muted-foreground">
          History shows the commit graph once this project is tracked by Git.
        </p>
      </div>
    );
  }

  const contextRefName = contextTarget?.refValue ? checkoutRefName(contextTarget.refValue) : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border/60 px-2 py-1.5">
        <Select
          value={refFilter ?? ALL_BRANCHES}
          onValueChange={(value) => {
            if (typeof value !== "string") return;
            setLimit(HISTORY_PAGE_SIZE);
            setRefFilter(value === ALL_BRANCHES ? null : value);
          }}
        >
          <SelectTrigger className="h-6 w-44 text-xs" aria-label="Branch filter">
            <SelectValue>{refFilter ?? "Show All"}</SelectValue>
          </SelectTrigger>
          <SelectPopup align="start" alignItemWithTrigger={false}>
            <SelectItem hideIndicator value={ALL_BRANCHES}>
              Show All
            </SelectItem>
            {(branchesQuery.data?.refs ?? []).map((ref) => (
              <SelectItem hideIndicator key={ref.name} value={ref.name}>
                {ref.name}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
        <label className="flex cursor-default items-center gap-1.5 text-xs text-muted-foreground">
          <Checkbox
            checked={includeRemotes}
            onCheckedChange={(checked) => {
              setLimit(HISTORY_PAGE_SIZE);
              setIncludeRemotes(Boolean(checked));
            }}
          />
          Show remote branches
        </label>
        <div className="flex-1" />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="size-6 p-0"
          aria-label="Refresh history"
          onClick={() => refresh()}
        >
          <RotateCw className="size-3.5" />
        </Button>
      </div>

      <div className="flex shrink-0 items-center gap-2 border-b border-border/60 px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">
        <span style={{ width: graphWidth }} className="shrink-0">
          Graph
        </span>
        <span className="min-w-0 flex-1">Description</span>
        <span className="w-36 shrink-0">Date</span>
        <span className="w-24 shrink-0">Author</span>
        <span className="w-16 shrink-0">Commit</span>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <ContextMenu.Root>
          <ContextMenu.Trigger
            className="flex flex-col"
            onContextMenu={handleContextMenu}
            data-history-rows
          >
            {view.rows.map((row, index) => {
              const graphRow = view.graph.rows[index];
              if (!graphRow) return null;
              if (row.kind === "pending") {
                return (
                  <div
                    key={row.sha}
                    className="flex shrink-0 items-center gap-2 px-2 text-xs"
                    style={{ height: GRAPH_ROW_HEIGHT }}
                  >
                    <GitGraphColumn
                      row={graphRow}
                      laneCount={view.graph.laneCount}
                      variant="pending"
                    />
                    <span className="min-w-0 flex-1 truncate font-medium">
                      Uncommitted Changes ({row.fileCount})
                    </span>
                    <span className="w-36 shrink-0 text-muted-foreground">—</span>
                    <span className="w-24 shrink-0 text-muted-foreground">*</span>
                    <span className="w-16 shrink-0 font-mono text-muted-foreground">*</span>
                  </div>
                );
              }

              const { commit } = row;
              const selected = selectedSha === commit.sha;
              return (
                <div
                  key={commit.sha}
                  role="button"
                  tabIndex={0}
                  data-commit-sha={commit.sha}
                  data-commit-subject={commit.subject}
                  className={cn(
                    "flex shrink-0 cursor-default items-center gap-2 px-2 text-xs",
                    selected ? "bg-accent text-foreground" : "hover:bg-accent/50",
                  )}
                  style={{ height: GRAPH_ROW_HEIGHT }}
                  onClick={() => {
                    setSelectedSha(commit.sha);
                    onOpenCommit({
                      sha: commit.sha,
                      shortSha: commit.shortSha,
                      subject: commit.subject,
                    });
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    setSelectedSha(commit.sha);
                    onOpenCommit({
                      sha: commit.sha,
                      shortSha: commit.shortSha,
                      subject: commit.subject,
                    });
                  }}
                >
                  <GitGraphColumn
                    row={graphRow}
                    laneCount={view.graph.laneCount}
                    variant={row.isHead ? "head" : "commit"}
                  />
                  <span className="flex min-w-0 flex-1 items-center gap-1">
                    {sortCommitRefs(commit.refs).map((refValue) => (
                      <span
                        key={`${refValue.kind}:${refValue.name}`}
                        data-ref-name={refValue.name}
                        data-ref-kind={refValue.kind}
                        data-ref-current={refValue.isCurrent ? "true" : "false"}
                        {...(refValue.remoteName ? { "data-ref-remote": refValue.remoteName } : {})}
                        className="contents"
                      >
                        <CommitRefBadge refValue={refValue} />
                      </span>
                    ))}
                    <span className="truncate">{commit.subject}</span>
                  </span>
                  <span className="w-36 shrink-0 tabular-nums text-muted-foreground">
                    {formatCommitDate(DateTime.toDateUtc(commit.authoredAt), timestampFormat)}
                  </span>
                  <span className="w-24 shrink-0 truncate text-muted-foreground">
                    {commit.authorName}
                  </span>
                  <span className="w-16 shrink-0 font-mono text-muted-foreground">
                    {commit.shortSha}
                  </span>
                </div>
              );
            })}
          </ContextMenu.Trigger>

          <MenuPopup className="min-w-48">
            {contextRefName ? (
              <>
                <MenuItem
                  disabled={contextTarget?.refValue?.isCurrent === true}
                  onClick={() => void checkout(contextRefName)}
                >
                  Check out {contextRefName}
                </MenuItem>
                <MenuItem onClick={() => copyOrWarn(contextRefName, "branch name")}>
                  Copy branch name
                </MenuItem>
                <MenuSeparator />
              </>
            ) : null}
            <MenuItem
              disabled={!contextTarget?.commitSha}
              onClick={() => {
                if (contextTarget?.commitSha) copyOrWarn(contextTarget.commitSha, "commit SHA");
              }}
            >
              Copy commit SHA
            </MenuItem>
            <MenuItem
              disabled={!contextTarget?.commitSubject}
              onClick={() => {
                if (contextTarget?.commitSubject) {
                  copyOrWarn(contextTarget.commitSubject, "commit message");
                }
              }}
            >
              Copy commit message
            </MenuItem>
          </MenuPopup>
        </ContextMenu.Root>

        {commitsQuery.isPending && view.rows.length === 0 ? (
          <p className="px-3 py-2 text-xs text-muted-foreground/70">Loading history...</p>
        ) : null}
        {commitsQuery.error && view.rows.length === 0 ? (
          <p className="px-3 py-2 text-xs text-destructive-foreground/80">{commitsQuery.error}</p>
        ) : null}
        {!commitsQuery.isPending && !commitsQuery.error && view.rows.length === 0 ? (
          <p className="px-3 py-2 text-xs text-muted-foreground/70">No commits yet.</p>
        ) : null}
        {canLoadMore ? (
          <div className="p-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full text-xs"
              onClick={() =>
                setLimit((current) => Math.min(current + HISTORY_PAGE_SIZE, HISTORY_MAX_COMMITS))
              }
            >
              Load more
            </Button>
          </div>
        ) : null}
      </ScrollArea>
    </div>
  );
}

export default GitHistoryPanel;
