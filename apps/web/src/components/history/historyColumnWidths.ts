/**
 * Widths for the History panel's Graph, Date, Author and Commit columns.
 *
 * The panel writes each width into a CSS variable on its own root, so a drag
 * repaints the rows without re-rendering the list. This module owns the bounds
 * those widths are held to, the variable names the rows read, the edge each
 * handle sits on, and the storage keys a resized column is remembered under.
 */
import { GRAPH_LANE_WIDTH } from "./GitGraphColumn";

export const HISTORY_COLUMN_KEYS = ["graph", "date", "author", "sha"] as const;

export type HistoryColumnKey = (typeof HISTORY_COLUMN_KEYS)[number];

export interface HistoryColumnBounds {
  readonly defaultWidth: number;
  readonly minWidth: number;
  readonly maxWidth: number;
}

/**
 * Date, Author and Commit default to the fixed widths they shipped with (w-36,
 * w-24, w-16); Graph has no fixed default because it is normally as wide as the
 * lanes it draws, and `resolveHistoryColumnWidths` is handed that width. The
 * maximums exist because Description takes whatever the others leave behind:
 * without them a drag could squeeze the commit subject out of the row.
 */
export const HISTORY_COLUMN_BOUNDS: Readonly<Record<HistoryColumnKey, HistoryColumnBounds>> = {
  graph: { defaultWidth: GRAPH_LANE_WIDTH, minWidth: GRAPH_LANE_WIDTH, maxWidth: 400 },
  date: { defaultWidth: 144, minWidth: 72, maxWidth: 320 },
  author: { defaultWidth: 96, minWidth: 56, maxWidth: 280 },
  sha: { defaultWidth: 64, minWidth: 48, maxWidth: 200 },
};

/** Column names as the header shows them; used for the handles' labels. */
export const HISTORY_COLUMN_LABELS: Readonly<Record<HistoryColumnKey, string>> = {
  graph: "Graph",
  date: "Date",
  author: "Author",
  sha: "Commit",
};

/**
 * Which side of the column its handle sits on. Graph is the only column left of
 * Description, so it is the only one that grows as the pointer moves right.
 */
export const HISTORY_COLUMN_EDGES: Readonly<Record<HistoryColumnKey, "left" | "right">> = {
  graph: "right",
  date: "left",
  author: "left",
  sha: "left",
};

export type HistoryColumnWidths = Readonly<Record<HistoryColumnKey, number>>;

/** A width the user set by dragging, or `null` for "whatever the panel picks". */
export type HistoryColumnOverrides = Readonly<Record<HistoryColumnKey, number | null>>;

export const NO_HISTORY_COLUMN_OVERRIDES: HistoryColumnOverrides = {
  graph: null,
  date: null,
  author: null,
  sha: null,
};

export function historyColumnWidthStorageKey(column: HistoryColumnKey): string {
  return `t3code:history-column-width:${column}`;
}

export function historyColumnWidthVariable(column: HistoryColumnKey): string {
  return `--history-col-${column}`;
}

export function clampHistoryColumnWidth(column: HistoryColumnKey, width: number): number {
  const bounds = HISTORY_COLUMN_BOUNDS[column];
  if (!Number.isFinite(width)) return bounds.defaultWidth;
  return Math.round(Math.max(bounds.minWidth, Math.min(bounds.maxWidth, width)));
}

/**
 * Turns the persisted overrides into a full set of usable widths. A column the
 * user never dragged falls back — Graph to the width its lanes need, the rest to
 * their defaults — and an out-of-range value written by an older build is pulled
 * back into range rather than left to make a column unreadable.
 */
export function resolveHistoryColumnWidths(
  overrides: Readonly<Partial<Record<HistoryColumnKey, number | null>>>,
  graphAutoWidth: number = HISTORY_COLUMN_BOUNDS.graph.defaultWidth,
): HistoryColumnWidths {
  return {
    graph: resolveColumnWidth("graph", overrides.graph, graphAutoWidth),
    date: resolveColumnWidth("date", overrides.date),
    author: resolveColumnWidth("author", overrides.author),
    sha: resolveColumnWidth("sha", overrides.sha),
  };
}

/** The variable declarations the panel root carries for its rows to read. */
export function historyColumnWidthVariables(
  widths: HistoryColumnWidths,
): Readonly<Record<string, string>> {
  return {
    [historyColumnWidthVariable("graph")]: `${widths.graph}px`,
    [historyColumnWidthVariable("date")]: `${widths.date}px`,
    [historyColumnWidthVariable("author")]: `${widths.author}px`,
    [historyColumnWidthVariable("sha")]: `${widths.sha}px`,
  };
}

function resolveColumnWidth(
  column: HistoryColumnKey,
  override: number | null | undefined,
  fallbackWidth: number = HISTORY_COLUMN_BOUNDS[column].defaultWidth,
): number {
  return override === null || override === undefined
    ? clampHistoryColumnWidth(column, fallbackWidth)
    : clampHistoryColumnWidth(column, override);
}
