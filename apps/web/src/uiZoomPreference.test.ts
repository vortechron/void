import { describe, expect, it } from "vite-plus/test";

// Vite inlines the shell so the drift check reads the same file the app ships.
import bootHtml from "../index.html?raw";

import * as Schema from "effect/Schema";

import { removeLocalStorageItem, setLocalStorageItem } from "./hooks/useLocalStorage";
import {
  DEFAULT_UI_ZOOM,
  MAX_UI_ZOOM,
  MIN_UI_ZOOM,
  UI_ZOOM_STORAGE_KEY,
  UiZoom,
  isUiZoomActive,
  readStoredUiZoom,
  resolveUiZoomFactor,
} from "./uiZoomPreference";

describe("interface zoom preference", () => {
  it("only counts as active away from the default", () => {
    expect(isUiZoomActive(DEFAULT_UI_ZOOM)).toBe(false);
    expect(isUiZoomActive(80)).toBe(true);
    expect(isUiZoomActive(125)).toBe(true);
  });

  it("converts the stored percentage to a CSS zoom factor", () => {
    expect(resolveUiZoomFactor(100)).toBe("1");
    expect(resolveUiZoomFactor(80)).toBe("0.8");
    expect(resolveUiZoomFactor(150)).toBe("1.5");
  });

  it("reads a stored zoom back", () => {
    setLocalStorageItem(UI_ZOOM_STORAGE_KEY, 75, UiZoom);
    expect(readStoredUiZoom()).toBe(75);
  });

  it("falls back to the default when storage holds something unusable", () => {
    setLocalStorageItem(UI_ZOOM_STORAGE_KEY, "eighty", Schema.String);
    expect(readStoredUiZoom()).toBe(DEFAULT_UI_ZOOM);

    setLocalStorageItem(UI_ZOOM_STORAGE_KEY, MAX_UI_ZOOM + 5, Schema.Number);
    expect(readStoredUiZoom()).toBe(DEFAULT_UI_ZOOM);

    setLocalStorageItem(UI_ZOOM_STORAGE_KEY, MIN_UI_ZOOM - 5, Schema.Number);
    expect(readStoredUiZoom()).toBe(DEFAULT_UI_ZOOM);

    removeLocalStorageItem(UI_ZOOM_STORAGE_KEY);
    expect(readStoredUiZoom()).toBe(DEFAULT_UI_ZOOM);
  });

  // The boot script cannot import this module: it runs from index.html before
  // any bundle loads. It therefore repeats the key and the bounds, and drifting
  // apart would either ignore a stored zoom or apply one out of range.
  it("agrees with the pre-paint boot script in index.html", () => {
    expect(bootHtml).toContain(`const UI_ZOOM_STORAGE_KEY = "${UI_ZOOM_STORAGE_KEY}";`);
    expect(bootHtml).toContain(`const MIN_UI_ZOOM = ${MIN_UI_ZOOM};`);
    expect(bootHtml).toContain(`const MAX_UI_ZOOM = ${MAX_UI_ZOOM};`);
    expect(bootHtml).toContain(`const DEFAULT_UI_ZOOM = ${DEFAULT_UI_ZOOM};`);
  });
});
