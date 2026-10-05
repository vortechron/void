export const RIGHT_PANEL_INLINE_LAYOUT_MEDIA_QUERY = "(max-width: 980px)";
export const RIGHT_PANEL_SHEET_WIDTH_STORAGE_KEY = "t3code:right-panel-sheet-width";
export const RIGHT_PANEL_SHEET_MIN_WIDTH = 320;
/**
 * Strip of backdrop the sheet never covers while it is restored, so pressing
 * outside always stays available as a way to dismiss it. Maximizing bypasses
 * this on purpose — the restore control in the tab bar is the way back.
 */
const RIGHT_PANEL_SHEET_BACKDROP_GUTTER = 48;
const RIGHT_PANEL_SHEET_COMPACT_VIEWPORT = 760;

export function getRightPanelSheetMaxWidth(viewportWidth: number): number {
  // Never below the minimum: `useResizableWidth` resolves an inverted range to
  // the minimum and then persists it, which would erase the user's width.
  return Math.max(
    RIGHT_PANEL_SHEET_MIN_WIDTH,
    Math.floor(viewportWidth) - RIGHT_PANEL_SHEET_BACKDROP_GUTTER,
  );
}

/**
 * Width the sheet opens at before the user has ever dragged it. Reproduces the
 * static `min(42vw, 28rem)` / `min(88vw, 24rem)` rules the class name used to
 * carry, so an existing install opens exactly as wide as it did before.
 */
export function getRightPanelSheetDefaultWidth(viewportWidth: number): number {
  const preferred =
    viewportWidth <= RIGHT_PANEL_SHEET_COMPACT_VIEWPORT
      ? Math.min(Math.floor(viewportWidth * 0.88), 384)
      : Math.min(Math.floor(viewportWidth * 0.42), 448);
  return Math.min(
    getRightPanelSheetMaxWidth(viewportWidth),
    Math.max(RIGHT_PANEL_SHEET_MIN_WIDTH, preferred),
  );
}

export type ThreadPanelPresentation = "inline" | "popover";
