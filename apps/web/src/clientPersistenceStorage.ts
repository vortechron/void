import { ClientSettingsSchema, type ClientSettings } from "@t3tools/contracts";

import { getLocalStorageItem, setLocalStorageItem } from "./hooks/useLocalStorage";

export const CLIENT_SETTINGS_STORAGE_KEY = "t3code:client-settings:v1";

/**
 * Theme keeps a localStorage copy even though the server owns the value.
 * `useTheme` applies it at module load, before React mounts, so the page never
 * paints the wrong theme while the server config is still in flight. The copy
 * is a cache written through on every change, never the source of truth.
 */
export const THEME_STORAGE_KEY = "t3code:theme";

function hasWindow(): boolean {
  return typeof window !== "undefined";
}

export function readBrowserClientSettings(): ClientSettings | null {
  if (!hasWindow()) {
    return null;
  }

  try {
    return getLocalStorageItem(CLIENT_SETTINGS_STORAGE_KEY, ClientSettingsSchema);
  } catch (error) {
    console.error("Could not read persisted client settings.", error);
    return null;
  }
}

export function writeBrowserClientSettings(settings: ClientSettings): void {
  if (!hasWindow()) {
    return;
  }

  setLocalStorageItem(CLIENT_SETTINGS_STORAGE_KEY, settings, ClientSettingsSchema);
}

/**
 * Drops the pre-move blob after it has been lifted into server settings, so
 * the migration cannot run a second time on this origin.
 */
export function clearBrowserClientSettings(): void {
  if (!hasWindow()) {
    return;
  }

  try {
    window.localStorage.removeItem(CLIENT_SETTINGS_STORAGE_KEY);
  } catch (error) {
    console.error("Could not clear persisted client settings.", error);
  }
}

/**
 * Raw read of the theme cache for the migration path. Returns the stored
 * string without validating it; the caller decides what an unrecognised value
 * means. `useTheme` has its own validating read for the render path.
 */
export function readBrowserThemePreference(): string | null {
  if (!hasWindow()) {
    return null;
  }

  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY);
  } catch (error) {
    console.error("Could not read persisted theme preference.", error);
    return null;
  }
}
