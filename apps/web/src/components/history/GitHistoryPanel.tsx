/**
 * History right-panel surface: the repository's commit graph.
 *
 * The panel answers "what landed, on which branch, by whom", hands a commit off
 * to the diff surface, and is the place branches, commits, tags and stashes are
 * acted on. What each right-click offers lives in `historyMenu.ts`; running it
 * and reporting the outcome lives in `useHistoryActions.ts`.
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
import { MenuPopup } from "~/components/ui/menu";
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
import { HistoryConfirmDialog, HistoryPromptDialog } from "./HistoryActionDialogs";
import { HistoryColumnResizeHandle } from "./HistoryColumnResizeHandle";
import { HistoryContextMenuItems } from "./HistoryContextMenuItems";
import {
  type HistoryConfirm,
  type HistoryMenuAction,
  type HistoryPrompt,
  buildHistoryMenu,
} from "./historyMenu";
import {
  buildHistoryView,
  formatCommitDate,
  formatCommitDateShort,
  sortCommitRefs,
} from "./historyRows";
import { useHistoryActions } from "./useHistoryActions";
import { useHistoryColumnWidths } from "./useHistoryColumnWidths";

/**
 * Which columns appear reacts to the panel's own width, not the viewport: the
 * panel is as narrow on a phone as it is when a desktop user drags it in. Below
 * each step the column is dropped rather than squeezed, so the subject keeps a
 * readable share of the row instead of being crushed to nothing.
 *
 * How wide a visible column is belongs to the user: the widths come from the
 * variables `useHistoryColumnWidths` writes onto the panel root. The short date
 * keeps a fixed width because there is no handle to drag at that size.
 */
const COLUMN = {
  /** Clips the lanes that no longer fit once the graph is dragged narrower. */
  graph: "flex w-(--history-col-graph) shrink-0 items-center overflow-hidden",
  dateShort: "w-16 shrink-0 @md/history:hidden",
  dateFull: "hidden w-(--history-col-date) shrink-0 @md/history:block",
  author: "hidden w-(--history-col-author) shrink-0 @lg/history:block",
  sha: "hidden w-(--history-col-sha) shrink-0 @xl/history:block",
} as const;

/**
 * Header cells stretch to the row's full height so their resize handle is a
 * target the whole way down, and each one is the positioning context for the
 * handle sitting on its left edge.
 */
const HEADER_COLUMN = {
  graph: "relative flex w-(--history-col-graph) shrink-0 items-center self-stretch",
  date: "relative flex w-16 shrink-0 items-center self-stretch @md/history:w-(--history-col-date)",
  author:
    "relative hidden w-(--history-col-author) shrink-0 items-center self-stretch @lg/history:flex",
  sha: "relative hidden w-(--history-col-sha) shrink-0 items-center self-stretch @xl/history:flex",
} as const;

const HISTORY_PAGE_SIZE = 100;
const HISTORY_MAX_COMMITS = 500;
const BRANCH_LIST_LIMIT = 100;
const ALL_BRANCHES = "__all__";
const DEFAULT_REMOTE_NAME = "origin";

export interface GitHistoryCommitTarget {
  readonly sha: string;
  readonly shortSha: string;
  readonly subject: string;
}

interface ContextTarget {
  readonly commitSha: string | null;
  readonly commitSubject: string | null;
  readonly refValue: VcsCommitRef | null;
  readonly isPendingRow: boolean;
}

function readContextTarget(element: HTMLElement | null): ContextTarget {
  const row = element?.closest<HTMLElement>("[data-commit-sha]") ?? null;
  const badge = element?.closest<HTMLElement>("[data-ref-name]") ?? null;
  const refName = badge?.dataset.refName ?? null;
  const refKind = badge?.dataset.refKind as VcsCommitRef["kind"] | undefined;
  return {
    commitSha: row?.dataset.commitSha ?? null,
    commitSubject: row?.dataset.commitSubject ?? null,
    isPendingRow: element?.closest("[data-pending-row]") !== null,
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
  const [pendingPrompt, setPendingPrompt] = useState<HistoryPrompt | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<HistoryConfirm | null>(null);

  const commitsQuery = useEnvironmentQuery(
    vcsEnvironment.listCommits({
      environmentId,
      input: {
        cwd,
        limit,
        includeStashes: true,
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
  const { rootRef, style: columnWidthStyle, resizeHandlers } = useHistoryColumnWidths(graphWidth);
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

  const { run: runHistoryAction, isRunning } = useHistoryActions({
    environmentId,
    cwd,
    onCompleted: refresh,
  });

  const handleContextMenu = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    setContextTarget(readContextTarget(event.target as HTMLElement | null));
  }, []);

  const menuGroups = useMemo(
    () =>
      contextTarget === null
        ? []
        : buildHistoryMenu(contextTarget, {
            currentRefName: commitsQuery.data?.headRefName ?? null,
            hasRemote: branchesQuery.data?.hasPrimaryRemote ?? false,
            defaultRemoteName: DEFAULT_REMOTE_NAME,
          }),
    [branchesQuery.data?.hasPrimaryRemote, commitsQuery.data?.headRefName, contextTarget],
  );

  const selectMenuAction = useCallback(
    (action: HistoryMenuAction) => {
      switch (action.kind) {
        case "run":
          void runHistoryAction(action.action);
          return;
        case "checkout":
          void checkout(action.refName);
          return;
        case "copy":
          copyOrWarn(action.value, action.label);
          return;
        case "prompt":
          setPendingPrompt(action.prompt);
          return;
        case "confirm":
          setPendingConfirm(action.confirm);
      }
    },
    [checkout, runHistoryAction],
  );

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

  return (
    <div
      ref={rootRef}
      style={columnWidthStyle}
      className="@container/history flex h-full min-h-0 flex-col"
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-border/60 px-2 py-1.5">
        <Select
          value={refFilter ?? ALL_BRANCHES}
          onValueChange={(value) => {
            if (typeof value !== "string") return;
            setLimit(HISTORY_PAGE_SIZE);
            setRefFilter(value === ALL_BRANCHES ? null : value);
          }}
        >
          <SelectTrigger
            className="h-6 min-w-0 flex-1 text-xs @sm/history:w-44 @sm/history:flex-none"
            aria-label="Branch filter"
          >
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
        <label className="flex shrink-0 cursor-default items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground">
          <Checkbox
            checked={includeRemotes}
            onCheckedChange={(checked) => {
              setLimit(HISTORY_PAGE_SIZE);
              setIncludeRemotes(Boolean(checked));
            }}
          />
          <span className="@sm/history:hidden">Remotes</span>
          <span className="hidden @sm/history:inline">Show remote branches</span>
        </label>
        <div className="hidden flex-1 @sm/history:block" />
        {isRunning ? (
          <span className="text-xs text-muted-foreground" role="status">
            Running...
          </span>
        ) : null}
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

      <div className="flex shrink-0 items-center gap-2 overflow-hidden border-b border-border/60 px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">
        <span className={HEADER_COLUMN.graph}>
          Graph
          <HistoryColumnResizeHandle column="graph" handlers={resizeHandlers.graph} />
        </span>
        <span className="min-w-0 flex-1 truncate">Description</span>
        <span className={HEADER_COLUMN.date}>
          <HistoryColumnResizeHandle
            column="date"
            handlers={resizeHandlers.date}
            className="hidden @md/history:block"
          />
          Date
        </span>
        <span className={HEADER_COLUMN.author}>
          <HistoryColumnResizeHandle column="author" handlers={resizeHandlers.author} />
          Author
        </span>
        <span className={HEADER_COLUMN.sha}>
          <HistoryColumnResizeHandle column="sha" handlers={resizeHandlers.sha} />
          Commit
        </span>
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
                    data-pending-row
                    className="flex shrink-0 items-center gap-2 overflow-hidden px-2 text-xs"
                    style={{ height: GRAPH_ROW_HEIGHT }}
                  >
                    <span className={COLUMN.graph}>
                      <GitGraphColumn
                        row={graphRow}
                        laneCount={view.graph.laneCount}
                        variant="pending"
                      />
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium">
                      Uncommitted Changes ({row.fileCount})
                    </span>
                    <span className="w-16 shrink-0 text-muted-foreground @md/history:w-(--history-col-date)">
                      —
                    </span>
                    <span className={cn(COLUMN.author, "text-muted-foreground")}>*</span>
                    <span className={cn(COLUMN.sha, "font-mono text-muted-foreground")}>*</span>
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
                    "flex shrink-0 cursor-default items-center gap-2 overflow-hidden px-2 text-xs",
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
                  <span className={COLUMN.graph}>
                    <GitGraphColumn
                      row={graphRow}
                      laneCount={view.graph.laneCount}
                      variant={row.isHead ? "head" : "commit"}
                    />
                  </span>
                  <span className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
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
                  <span className={cn(COLUMN.dateShort, "tabular-nums text-muted-foreground")}>
                    {formatCommitDateShort(DateTime.toDateUtc(commit.authoredAt))}
                  </span>
                  <span className={cn(COLUMN.dateFull, "tabular-nums text-muted-foreground")}>
                    {formatCommitDate(DateTime.toDateUtc(commit.authoredAt), timestampFormat)}
                  </span>
                  <span className={cn(COLUMN.author, "truncate text-muted-foreground")}>
                    {commit.authorName}
                  </span>
                  <span className={cn(COLUMN.sha, "font-mono text-muted-foreground")}>
                    {commit.shortSha}
                  </span>
                </div>
              );
            })}
          </ContextMenu.Trigger>

          <MenuPopup className="min-w-56">
            <HistoryContextMenuItems groups={menuGroups} onSelect={selectMenuAction} />
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

      <HistoryPromptDialog
        prompt={pendingPrompt}
        onSubmit={(value) => {
          if (pendingPrompt) void runHistoryAction(pendingPrompt.build(value));
        }}
        onClose={() => setPendingPrompt(null)}
      />
      <HistoryConfirmDialog
        confirm={pendingConfirm}
        onConfirm={() => {
          if (pendingConfirm) void runHistoryAction(pendingConfirm.action);
        }}
        onClose={() => setPendingConfirm(null)}
      />
    </div>
  );
}

export default GitHistoryPanel;
