/**
 * Display model for the history surface.
 *
 * The panel renders one flat list: an optional "Uncommitted Changes" row on top
 * of the commit page. That pending row is fed into the graph as a child of HEAD
 * so its node sits on the current branch's lane instead of floating.
 */
import type { TimestampFormat } from "@t3tools/contracts/settings";
import type { VcsCommit, VcsCommitRef, VcsListCommitsResult } from "@t3tools/contracts";

import { buildGitGraph, type GitGraph, type GitGraphInputCommit } from "~/lib/gitGraph";

export const PENDING_ROW_SHA = "\u0000uncommitted";

export interface HistoryPendingRow {
  readonly kind: "pending";
  readonly sha: string;
  readonly fileCount: number;
}

export interface HistoryCommitRow {
  readonly kind: "commit";
  readonly sha: string;
  readonly commit: VcsCommit;
  readonly isHead: boolean;
}

export type HistoryRow = HistoryPendingRow | HistoryCommitRow;

export interface HistoryView {
  readonly rows: ReadonlyArray<HistoryRow>;
  readonly graph: GitGraph;
}

const EMPTY_VIEW: HistoryView = { rows: [], graph: { rows: [], laneCount: 0 } };

export function buildHistoryRows(result: VcsListCommitsResult | null): ReadonlyArray<HistoryRow> {
  if (!result) return [];

  const commitRows = result.commits.map<HistoryCommitRow>((commit) => ({
    kind: "commit",
    sha: commit.sha,
    commit,
    isHead: commit.sha === result.headSha,
  }));

  if (result.workingTreeFileCount === 0) return commitRows;

  return [
    { kind: "pending", sha: PENDING_ROW_SHA, fileCount: result.workingTreeFileCount },
    ...commitRows,
  ];
}

export function buildHistoryView(result: VcsListCommitsResult | null): HistoryView {
  if (!result) return EMPTY_VIEW;

  const rows = buildHistoryRows(result);
  const graphInput = rows.map<GitGraphInputCommit>((row) =>
    row.kind === "pending"
      ? { sha: row.sha, parents: result.headSha ? [result.headSha] : [] }
      : { sha: row.sha, parents: row.commit.parents },
  );

  return { rows, graph: buildGitGraph(graphInput) };
}

/**
 * Ref badges read left to right as current branch, other locals, remotes, then
 * tags — the order Fork and GitKraken use, so the branch you are on is first.
 */
const REF_SORT_WEIGHT: Record<VcsCommitRef["kind"], number> = {
  head: 0,
  local: 1,
  remote: 2,
  tag: 3,
  stash: 4,
};

export function sortCommitRefs(refs: ReadonlyArray<VcsCommitRef>): ReadonlyArray<VcsCommitRef> {
  return refs.toSorted((left, right) => {
    if (left.isCurrent !== right.isCurrent) return left.isCurrent ? -1 : 1;
    const weight = REF_SORT_WEIGHT[left.kind] - REF_SORT_WEIGHT[right.kind];
    return weight === 0 ? left.name.localeCompare(right.name) : weight;
  });
}

const dayMonthYearFormatter = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const dayMonthFormatter = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
});

function toValidDate(value: Date | string): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

const timeFormatterCache = new Map<TimestampFormat, Intl.DateTimeFormat>();

function getTimeFormatter(timestampFormat: TimestampFormat): Intl.DateTimeFormat {
  const cached = timeFormatterCache.get(timestampFormat);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    ...(timestampFormat === "locale" ? {} : { hour12: timestampFormat === "12-hour" }),
  });
  timeFormatterCache.set(timestampFormat, formatter);
  return formatter;
}

/** `6 Aug 2026 16:29` — dense enough for a table column, still unambiguous. */
export function formatCommitDate(value: Date | string, timestampFormat: TimestampFormat): string {
  const date = toValidDate(value);
  if (!date) return "";
  return `${dayMonthYearFormatter.format(date)} ${getTimeFormatter(timestampFormat).format(date)}`;
}

/**
 * `6 Aug` — what the Date column falls back to once the panel is too narrow to
 * carry the year and time without squeezing the subject out of the row.
 */
export function formatCommitDateShort(value: Date | string): string {
  const date = toValidDate(value);
  return date ? dayMonthFormatter.format(date) : "";
}

/**
 * A remote badge only needs its branch part once the remote is shown as a
 * separate chip, matching the `origin | main` split in the graph.
 */
export function splitRemoteRefName(ref: VcsCommitRef): {
  readonly remote: string | null;
  readonly branch: string;
} {
  if (ref.kind !== "remote") return { remote: null, branch: ref.name };
  const remote = ref.remoteName ?? null;
  if (!remote || !ref.name.startsWith(`${remote}/`)) return { remote, branch: ref.name };
  return { remote, branch: ref.name.slice(remote.length + 1) };
}

/**
 * The ref a checkout should target for a badge, or null when it has none.
 * `HEAD` is already where you are, and a stash is applied rather than checked
 * out.
 */
export function checkoutRefName(ref: VcsCommitRef): string | null {
  if (ref.kind === "head" || ref.kind === "stash") return null;
  return ref.name;
}
