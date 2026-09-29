import { type ReactNode, useEffect, useState } from "react";

import { useResizableWidth } from "../hooks/useResizableWidth";
import {
  getRightPanelSheetDefaultWidth,
  getRightPanelSheetMaxWidth,
  RIGHT_PANEL_SHEET_MIN_WIDTH,
  RIGHT_PANEL_SHEET_WIDTH_STORAGE_KEY,
} from "../rightPanelLayout";
import { RightPanelResizeHandle } from "./preview/RightPanelResizeHandle";
import { Sheet, SheetPopup } from "./ui/sheet";

const FALLBACK_VIEWPORT_WIDTH = 1024;

/**
 * Viewport width, re-read on resize. The sheet's bounds are derived from it, so
 * rotating a tablet re-clamps a stored width that no longer fits.
 */
function useViewportWidth(): number {
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window === "undefined" ? FALLBACK_VIEWPORT_WIDTH : window.innerWidth,
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    let frame = 0;
    const onResize = () => {
      // Coalesce rapid resize events into one rAF tick.
      if (frame !== 0) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        setViewportWidth(window.innerWidth);
      });
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      if (frame !== 0) window.cancelAnimationFrame(frame);
    };
  }, []);
  return viewportWidth;
}

/**
 * Compact-layout host for the right panel: an overlay sheet instead of a column
 * that would squeeze the chat. It carries the same resize handle and maximize
 * state as the inline panel, since a fixed-width sheet is the worst place to
 * read a diff on a tablet.
 */
export function RightPanelSheet(props: {
  animationDurationMs: number;
  children: ReactNode;
  maximized: boolean;
  open: boolean;
  onClose: () => void;
}) {
  const viewportWidth = useViewportWidth();
  const { width, handlers } = useResizableWidth({
    storageKey: RIGHT_PANEL_SHEET_WIDTH_STORAGE_KEY,
    defaultWidth: getRightPanelSheetDefaultWidth(viewportWidth),
    minWidth: RIGHT_PANEL_SHEET_MIN_WIDTH,
    maxWidth: getRightPanelSheetMaxWidth(viewportWidth),
    edge: "left",
  });
  return (
    <Sheet
      open={props.open}
      onOpenChange={(open) => {
        if (!open) {
          props.onClose();
        }
      }}
    >
      <SheetPopup
        transitionDurationMs={props.animationDurationMs}
        side="right"
        showCloseButton={false}
        keepMounted
        // Width is driven by `useResizableWidth` inline. `max-w-none` is load-bearing:
        // it cancels the `max-w-md` every right-side sheet popup ships with, which
        // would otherwise cap the inline width at 448px no matter how far you drag.
        className="max-w-none wco:mt-[env(titlebar-area-height)] wco:h-[calc(100%-env(titlebar-area-height))] wco:max-h-[calc(100%-env(titlebar-area-height))]"
        style={{ width: props.maximized ? "100%" : `${width}px` }}
      >
        {props.maximized ? null : <RightPanelResizeHandle handlers={handlers} />}
        {props.children}
      </SheetPopup>
    </Sheet>
  );
}
