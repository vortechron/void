import * as Schema from "effect/Schema";
import { useCallback } from "react";

import { getLocalStorageItem, useLocalStorage } from "./hooks/useLocalStorage";

/* ─────────────────────────────────────────────────────────
 * INTERFACE ZOOM
 *
 * Zoom answers "is this screen too small for me right now", so it belongs to
 * the browser looking at the screen, not to the account. A tablet held at
 * arm's length and a desktop monitor want different numbers, and syncing one
 * to the other would keep undoing the choice. That is why this preference
 * lives in local storage instead of the synced client settings.
 * ───────────────────────────────────────────────────────── */

export const UI_ZOOM_STORAGE_KEY = "t3code:ui-zoom";

export const MIN_UI_ZOOM = 50;
export const MAX_UI_ZOOM = 150;
export const DEFAULT_UI_ZOOM = 100;

export const UiZoom = Schema.Int.check(
  Schema.isBetween({ minimum: MIN_UI_ZOOM, maximum: MAX_UI_ZOOM }),
);
export type UiZoom = typeof UiZoom.Type;

const isUiZoom = Schema.is(UiZoom);

/** Zoom only earns its layout overrides once it is actually off 100%, so an
    untouched browser keeps the viewport-unit sizing it has always used. */
export function isUiZoomActive(zoom: number): boolean {
  return zoom !== DEFAULT_UI_ZOOM;
}

/** Percentage to the CSS `zoom` factor the stylesheet multiplies by. */
export function resolveUiZoomFactor(zoom: number): string {
  return String(zoom / 100);
}

/**
 * Non-reactive read, for the paths that run before or outside React. Anything
 * unusable in storage — absent, malformed, out of range — reads as the
 * default rather than throwing.
 */
export function readStoredUiZoom(): UiZoom {
  try {
    const stored = getLocalStorageItem(UI_ZOOM_STORAGE_KEY, UiZoom);
    return stored === null ? DEFAULT_UI_ZOOM : stored;
  } catch {
    return DEFAULT_UI_ZOOM;
  }
}

/** Reactive zoom for this browser, kept in step across tabs and windows. */
export function useUiZoom(): {
  readonly zoom: UiZoom;
  readonly setZoom: (zoom: number) => void;
  readonly resetZoom: () => void;
} {
  const [zoom, setStoredZoom] = useLocalStorage(UI_ZOOM_STORAGE_KEY, DEFAULT_UI_ZOOM, UiZoom);

  const setZoom = useCallback(
    (next: number) => {
      if (!isUiZoom(next)) return;
      setStoredZoom(next);
    },
    [setStoredZoom],
  );

  const resetZoom = useCallback(() => setStoredZoom(DEFAULT_UI_ZOOM), [setStoredZoom]);

  return { zoom, setZoom, resetZoom };
}
