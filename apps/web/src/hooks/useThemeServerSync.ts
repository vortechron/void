/**
 * Keeps the theme preference in step between its two homes.
 *
 * The server owns the value, so it follows you to any origin or device. The
 * browser keeps a localStorage copy purely so `useTheme` can paint the right
 * theme before React mounts — see `THEME_STORAGE_KEY`. This hook reconciles
 * them in both directions.
 *
 * It lives outside `useTheme` on purpose: `useTheme` is imported by low-level
 * modules and must stay free of the server-state graph that `useSettings`
 * pulls in.
 */
import { useEffect, useRef } from "react";

import {
  useClientSettings,
  useClientSettingsHydrated,
  useUpdateClientSettings,
} from "./useSettings";
import { applyThemeLocally, useTheme } from "./useTheme";

function isSharedTheme(theme: string): theme is "system" | "light" | "dark" {
  return theme === "system" || theme === "light" || theme === "dark";
}

export function useThemeServerSync(): void {
  const { theme } = useTheme();
  const serverTheme = useClientSettings((settings) => settings.theme);
  const settingsHydrated = useClientSettingsHydrated();
  const updateClientSettings = useUpdateClientSettings();

  // The last value seen from the server. A local value that disagrees with
  // *this* is a local edit that has not been pushed yet; a server value that
  // disagrees with it is a change made on another device. Without the
  // distinction the two effects fight: a fresh local pick would be reverted by
  // the still-stale server value before the write lands.
  const lastServerTheme = useRef<string | null>(null);

  useEffect(() => {
    if (!settingsHydrated) return;

    const serverChanged = lastServerTheme.current !== serverTheme;
    lastServerTheme.current = serverTheme;

    // Upstream custom themes are device-local. Keep the server preference
    // ready for a later switch back to a built-in theme, but never replace or
    // upload a custom theme id through Void's narrower shared setting.
    if (!isSharedTheme(theme)) return;

    // Retired named themes may still exist in server settings from older
    // Void builds. Replace them with the current basic preference instead of
    // writing an id that the upstream theme registry cannot render.
    if (!isSharedTheme(serverTheme)) {
      updateClientSettings({ theme });
      return;
    }

    if (serverTheme === theme) return;

    if (serverChanged) {
      applyThemeLocally(serverTheme);
      return;
    }

    updateClientSettings({ theme });
  }, [serverTheme, settingsHydrated, theme, updateClientSettings]);
}
