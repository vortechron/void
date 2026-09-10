/**
 * Drag-to-resize state for the History panel's columns.
 *
 * A drag writes the new width straight onto the panel root's CSS variable and
 * never through React: the list under the header can hold hundreds of rows, and
 * re-rendering them on every pointer frame is the one thing this panel cannot
 * afford. React state is only touched when the pointer is lifted, which is also
 * when the width is persisted, so the columns come back the same next session.
 *
 * State holds what the user dragged, not the width itself. A column nobody
 * touched keeps following the panel — the Graph column in particular has to
 * stay as wide as the lanes it draws until someone decides otherwise.
 */
import * as Schema from "effect/Schema";
import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { readEffectiveZoom } from "~/effectiveZoom";
import {
  getLocalStorageItem,
  removeLocalStorageItem,
  setLocalStorageItem,
} from "~/hooks/useLocalStorage";

import {
  HISTORY_COLUMN_EDGES,
  type HistoryColumnKey,
  type HistoryColumnOverrides,
  NO_HISTORY_COLUMN_OVERRIDES,
  clampHistoryColumnWidth,
  historyColumnWidthStorageKey,
  historyColumnWidthVariable,
  historyColumnWidthVariables,
  resolveHistoryColumnWidths,
} from "./historyColumnWidths";

const WidthSchema = Schema.Finite;

export interface HistoryColumnResizeHandlers {
  readonly onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  readonly onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  readonly onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
  readonly onPointerCancel: () => void;
  readonly onLostPointerCapture: () => void;
  readonly onDoubleClick: () => void;
}

interface DragState {
  readonly column: HistoryColumnKey;
  readonly pointerId: number;
  readonly startX: number;
  readonly startWidth: number;
  readonly zoom: number;
  readonly handle: HTMLElement;
  pendingWidth: number;
  rafId: number | null;
}

function readStoredOverrides(): HistoryColumnOverrides {
  try {
    return {
      graph: getLocalStorageItem(historyColumnWidthStorageKey("graph"), WidthSchema),
      date: getLocalStorageItem(historyColumnWidthStorageKey("date"), WidthSchema),
      author: getLocalStorageItem(historyColumnWidthStorageKey("author"), WidthSchema),
      sha: getLocalStorageItem(historyColumnWidthStorageKey("sha"), WidthSchema),
    };
  } catch (error) {
    console.error("Could not read the persisted history column widths.", error);
    return NO_HISTORY_COLUMN_OVERRIDES;
  }
}

/**
 * The live width of a column, taken from the element a drag writes to rather
 * than from React state, which is a frame or more behind mid-drag.
 */
function readRenderedWidth(root: HTMLElement, column: HistoryColumnKey): number {
  const declared = root.style.getPropertyValue(historyColumnWidthVariable(column));
  return clampHistoryColumnWidth(column, Number.parseFloat(declared));
}

export function useHistoryColumnWidths(graphAutoWidth: number): {
  /** Attach to the element carrying `style`; the drag writes its variables. */
  readonly rootRef: (node: HTMLDivElement | null) => void;
  readonly style: CSSProperties;
  readonly resizeHandlers: Readonly<Record<HistoryColumnKey, HistoryColumnResizeHandlers>>;
} {
  const [overrides, setOverrides] = useState<HistoryColumnOverrides>(readStoredOverrides);
  const rootElementRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);

  const writeWidth = useCallback((column: HistoryColumnKey, width: number) => {
    rootElementRef.current?.style.setProperty(historyColumnWidthVariable(column), `${width}px`);
  }, []);

  const releaseDrag = useCallback((drag: DragState) => {
    // Cleared first: releasing capture can re-enter through lostpointercapture.
    dragRef.current = null;
    if (drag.rafId !== null) cancelAnimationFrame(drag.rafId);
    try {
      if (drag.handle.hasPointerCapture(drag.pointerId)) {
        drag.handle.releasePointerCapture(drag.pointerId);
      }
    } catch {
      // The pointer may already be released; nothing to undo.
    }
    document.body.style.removeProperty("cursor");
    document.body.style.removeProperty("user-select");
  }, []);

  const cancelDrag = useCallback(() => {
    const drag = dragRef.current;
    if (!drag) return;
    releaseDrag(drag);
    writeWidth(drag.column, drag.startWidth);
  }, [releaseDrag, writeWidth]);

  const startDrag = useCallback(
    (column: HistoryColumnKey, event: ReactPointerEvent<HTMLElement>) => {
      const root = rootElementRef.current;
      if (!root || event.button !== 0 || dragRef.current) return;
      event.preventDefault();
      event.stopPropagation();
      const handle = event.currentTarget;
      try {
        handle.setPointerCapture(event.pointerId);
      } catch {
        return;
      }
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      const startWidth = readRenderedWidth(root, column);
      dragRef.current = {
        column,
        pointerId: event.pointerId,
        startX: event.clientX,
        startWidth,
        pendingWidth: startWidth,
        rafId: null,
        // Pointer coordinates arrive in post-zoom pixels while the width is
        // read back inside the zoomed box, so the travel has to be converted
        // or the column outruns the pointer.
        zoom: readEffectiveZoom(root),
        handle,
      };
    },
    [],
  );

  const moveDrag = useCallback(
    (column: HistoryColumnKey, event: ReactPointerEvent<HTMLElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.column !== column || drag.pointerId !== event.pointerId) return;
      event.preventDefault();
      // A handle on the column's left edge widens it as the pointer moves left;
      // one on the right edge widens it as the pointer moves right.
      const pointerTravel =
        HISTORY_COLUMN_EDGES[column] === "left"
          ? drag.startX - event.clientX
          : event.clientX - drag.startX;
      drag.pendingWidth = clampHistoryColumnWidth(
        column,
        drag.startWidth + pointerTravel / drag.zoom,
      );
      if (drag.rafId !== null) return;
      drag.rafId = requestAnimationFrame(() => {
        const active = dragRef.current;
        if (!active) return;
        active.rafId = null;
        writeWidth(active.column, active.pendingWidth);
      });
    },
    [writeWidth],
  );

  const endDrag = useCallback(
    (column: HistoryColumnKey, event: ReactPointerEvent<HTMLElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.column !== column || drag.pointerId !== event.pointerId) return;
      const finalWidth = drag.pendingWidth;
      releaseDrag(drag);
      writeWidth(column, finalWidth);
      setOverrides((current) => ({ ...current, [column]: finalWidth }));
      // Once per drag, not once per frame.
      try {
        setLocalStorageItem(historyColumnWidthStorageKey(column), finalWidth, WidthSchema);
      } catch (error) {
        console.error("Could not persist the history column width.", error);
      }
    },
    [releaseDrag, writeWidth],
  );

  const resetColumn = useCallback((column: HistoryColumnKey) => {
    if (dragRef.current) return;
    // Dropping the override hands the column back to the panel; the style this
    // hook returns then writes the width the column would have had all along.
    setOverrides((current) => ({ ...current, [column]: null }));
    try {
      removeLocalStorageItem(historyColumnWidthStorageKey(column));
    } catch (error) {
      console.error("Could not forget the history column width.", error);
    }
  }, []);

  useEffect(() => {
    window.addEventListener("blur", cancelDrag);
    return () => {
      window.removeEventListener("blur", cancelDrag);
      const drag = dragRef.current;
      if (drag) releaseDrag(drag);
    };
  }, [cancelDrag, releaseDrag]);

  const rootRef = useCallback((node: HTMLDivElement | null) => {
    rootElementRef.current = node;
  }, []);

  const resizeHandlers = useMemo(() => {
    const handlersFor = (column: HistoryColumnKey): HistoryColumnResizeHandlers => ({
      onPointerDown: (event) => startDrag(column, event),
      onPointerMove: (event) => moveDrag(column, event),
      onPointerUp: (event) => endDrag(column, event),
      onPointerCancel: cancelDrag,
      onLostPointerCapture: cancelDrag,
      onDoubleClick: () => resetColumn(column),
    });
    return {
      graph: handlersFor("graph"),
      date: handlersFor("date"),
      author: handlersFor("author"),
      sha: handlersFor("sha"),
    };
  }, [cancelDrag, endDrag, moveDrag, resetColumn, startDrag]);

  const style = useMemo(
    () => historyColumnWidthVariables(resolveHistoryColumnWidths(overrides, graphAutoWidth)),
    [graphAutoWidth, overrides],
  );

  return { rootRef, style: style as CSSProperties, resizeHandlers };
}
