import { cn } from "~/lib/utils";

import {
  HISTORY_COLUMN_EDGES,
  HISTORY_COLUMN_LABELS,
  type HistoryColumnKey,
} from "./historyColumnWidths";
import type { HistoryColumnResizeHandlers } from "./useHistoryColumnWidths";

/**
 * Grab target for the edge of a History column, placed on whichever side that
 * column grows from.
 *
 * It covers the gap between two headers so the user can aim at the boundary
 * rather than a hairline, and shows a 1px rule on hover the way the panel's own
 * edge handle does. Double-click hands the column back to its default width.
 */
export function HistoryColumnResizeHandle({
  column,
  handlers,
  className,
}: {
  column: HistoryColumnKey;
  handlers: HistoryColumnResizeHandlers;
  className?: string;
}) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={`Resize the ${HISTORY_COLUMN_LABELS[column]} column`}
      className={cn(
        "group absolute -inset-y-1 z-10 w-3 touch-none cursor-col-resize select-none",
        HISTORY_COLUMN_EDGES[column] === "left" ? "-left-2.5" : "-right-2.5",
        className,
      )}
      {...handlers}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-transparent transition-colors duration-150 group-hover:bg-border group-active:bg-primary/60"
      />
    </div>
  );
}
