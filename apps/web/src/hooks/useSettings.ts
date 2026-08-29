/**
 * Environment-scoped settings hooks.
 *
 * Every setting is server-authoritative, persisted in `settings.json` and
 * fetched via `server.getConfig`. UI preferences (`ClientSettings`) are stored
 * there too, under the nested `clientSettings` key.
 *
 * They used to live in the browser's localStorage, which is scoped per origin:
 * reaching the same server through a different hostname (a tailnet name rather
 * than localhost) or from a second device presented a fresh, empty set of
 * preferences. Storing them next to the server settings makes them follow the
 * server instead of the browser. localStorage survives only as a one-time
 * migration source, read by `useClientSettingsMigration` below.
 *
 * Live server settings always require an environment id. Primary-environment
 * access is intentionally named as such so environment-sensitive consumers
 * cannot silently read the wrong server's settings.
 */
import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { useAtomValue } from "@effect/atom-react";
import {
  DEFAULT_SERVER_SETTINGS,
  type EnvironmentId,
  ServerSettings,
  type ServerSettingsPatch,
} from "@t3tools/contracts";
import {
  APP_THEME_VALUES,
  type AppThemePreference,
  type ClientSettingsPatch,
  type ClientSettings,
  DEFAULT_CLIENT_SETTINGS,
  type EnvironmentIdentificationMode,
  type UnifiedSettings,
  type UsageMeterMode,
  type UsageMeterSettings,
  type VoiceDictationSettings,
} from "@t3tools/contracts/settings";
import {
  clearBrowserClientSettings,
  readBrowserClientSettings,
  readBrowserThemePreference,
} from "~/clientPersistenceStorage";
import {
  getThemeDefinition,
  getThemePreviewSidebarArtwork,
  resolveThemeHalf,
  subscribeToThemePreview,
  themeAllowsSidebarArtwork,
} from "~/themePalette";
import * as Struct from "effect/Struct";
import { appAtomRegistry } from "~/rpc/atomRegistry";
import { primaryEnvironmentIdAtom } from "~/state/primaryEnvironment";
import {
  primaryServerConfigAtom,
  primaryServerSettingsAtom,
  serverEnvironment,
} from "~/state/server";
import { usePrimaryEnvironment } from "~/state/environments";
import { useAtomCommand } from "~/state/use-atom-command";
import { useTheme } from "./useTheme";

type UnifiedSettingsPatch = ServerSettingsPatch & ClientSettingsPatch;

/**
 * Test-only override. Tests that need a specific `ClientSettings` without
 * standing up a server config stream set this instead of the atom.
 */
let clientSettingsTestOverride: ClientSettings | null = null;

/**
 * Imperative read for the non-React call sites. Reading straight out of the
 * atom registry keeps a single source of truth — there is no second copy that
 * can drift from what the hooks render.
 */
function readClientSettingsSnapshot(): ClientSettings {
  if (clientSettingsTestOverride) {
    return clientSettingsTestOverride;
  }
  try {
    return appAtomRegistry.get(primaryServerSettingsAtom).clientSettings;
  } catch {
    // No registry yet (module loaded outside the app tree, or during teardown).
    return DEFAULT_CLIENT_SETTINGS;
  }
}

// ── Key sets for routing patches ─────────────────────────────────────

const SERVER_SETTINGS_KEYS = new Set<string>(Struct.keys(ServerSettings.fields));

function splitPatch(patch: UnifiedSettingsPatch): {
  serverPatch: ServerSettingsPatch;
  clientPatch: ClientSettingsPatch;
} {
  const serverPatch: Record<string, unknown> = {};
  const clientPatch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (SERVER_SETTINGS_KEYS.has(key)) {
      serverPatch[key] = value;
    } else {
      clientPatch[key] = value;
    }
  }
  return {
    serverPatch: serverPatch as ServerSettingsPatch,
    clientPatch: clientPatch as ClientSettingsPatch,
  };
}

// ── Hooks ────────────────────────────────────────────────────────────

/**
 * Non-hook accessor for the current merged client settings snapshot.
 * Used by non-React code paths (e.g. runtime services) that need the latest
 * settings without subscribing.
 */
export function getClientSettings(): ClientSettings {
  return readClientSettingsSnapshot();
}

/**
 * Resolves once client settings have actually arrived.
 *
 * The pre-hydration snapshot is just the schema defaults, so imperative paths
 * that open a preview must await this or they bake the built-in viewport, zoom
 * and appearance into a tab that never picks up the user's saved values.
 *
 * These settings ride the server config stream rather than localStorage here,
 * so the primary server's config landing is the signal — not a disk read.
 * That means the wait only makes sense while a primary environment exists to
 * deliver one; with none paired, nothing would ever resolve it.
 */
export function ensureClientSettingsHydrated(): Promise<void> {
  if (
    clientSettingsTestOverride !== null ||
    appAtomRegistry.get(primaryServerConfigAtom) !== null ||
    appAtomRegistry.get(primaryEnvironmentIdAtom) === null
  ) {
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    let settled = false;
    let unsubscribe: (() => void) | null = null;
    const finish = () => {
      if (settled) return;
      settled = true;
      // The listener can fire before `subscribe` returns, so unsubscribing is
      // deferred to whichever of the two runs second.
      unsubscribe?.();
      resolve();
    };
    unsubscribe = appAtomRegistry.subscribe(primaryServerConfigAtom, (config) => {
      if (config !== null) finish();
    });
    if (settled) unsubscribe();
  });
}

/**
 * Whether the server's settings have actually arrived. Consumers use this to
 * hold off on rendering a persisted choice, so a stored value never loses a
 * race with the schema default and swaps under the user a frame later.
 *
 * The server config is the signal now that these preferences come down the
 * config stream rather than out of localStorage.
 */
export function useClientSettingsHydrated(): boolean {
  return useAtomValue(primaryServerConfigAtom) !== null;
}

function useClientSettingsValue(): ClientSettings {
  const fromServer =
    useAtomValue(primaryServerSettingsAtom)?.clientSettings ?? DEFAULT_CLIENT_SETTINGS;
  return clientSettingsTestOverride ?? fromServer;
}

export function mergeEnvironmentSettings(
  serverSettings: ServerSettings,
  clientSettings: ClientSettings,
): UnifiedSettings {
  return { ...serverSettings, ...clientSettings };
}

function useMergedSettings<T>(
  serverSettings: ServerSettings,
  selector: ((settings: UnifiedSettings) => T) | undefined,
): T {
  const clientSettings = useClientSettingsValue();

  const merged = useMemo<UnifiedSettings>(
    () => mergeEnvironmentSettings(serverSettings, clientSettings),
    [clientSettings, serverSettings],
  );

  return useMemo(() => (selector ? selector(merged) : (merged as T)), [merged, selector]);
}

export function useClientSettings<T = ClientSettings>(
  selector?: (settings: ClientSettings) => T,
): T {
  const settings = useClientSettingsValue();
  return useMemo(() => (selector ? selector(settings) : (settings as T)), [selector, settings]);
}

export function resolveEnvironmentIdentificationMode(input: {
  mode: EnvironmentIdentificationMode;
  settingsHydrated: boolean;
  paletteThemeActive?: boolean;
  paletteThemeAllowsArtwork?: boolean;
}): EnvironmentIdentificationMode {
  // Avoid briefly rendering the default artwork before a persisted pill/none choice loads.
  if (!input.settingsHydrated) return "none";
  // Artwork palettes are maintained for built-ins only. Keep an explicit
  // "none", but use the theme-aware pill for user-controlled palettes.
  return input.paletteThemeActive && !input.paletteThemeAllowsArtwork && input.mode === "artwork"
    ? "pill"
    : input.mode;
}

export function useEnvironmentIdentificationMode(): EnvironmentIdentificationMode {
  const settingsHydrated = useClientSettingsHydrated();
  const mode = useClientSettingsValue().environmentIdentificationMode;
  const { resolvedTheme, theme, themeHalves } = useTheme();
  const previewSidebarArtwork = useSyncExternalStore(
    subscribeToThemePreview,
    getThemePreviewSidebarArtwork,
    () => null,
  );
  const activeTheme = resolveThemeHalf(theme, themeHalves, resolvedTheme);
  const activeThemeDefinition = getThemeDefinition(activeTheme);
  return resolveEnvironmentIdentificationMode({
    mode,
    settingsHydrated,
    paletteThemeActive: previewSidebarArtwork !== null || activeThemeDefinition !== null,
    paletteThemeAllowsArtwork: previewSidebarArtwork ?? themeAllowsSidebarArtwork(activeTheme),
  });
}

/**
 * Whether the upstream sidebar v2 is explicitly enabled in Settings → Beta.
 *
 * Held at Void's custom sidebar until client settings hydrate so a cold load
 * cannot briefly replace it with v2 before the persisted preference arrives.
 */
export function useSidebarV2Enabled(): boolean {
  const settingsHydrated = useClientSettingsHydrated();
  const sidebarV2Enabled = useClientSettingsValue().sidebarV2Enabled;
  return settingsHydrated && sidebarV2Enabled;
}

/** Presentation of the sidebar provider usage meter. */
export function useUsageMeterSettings(): UsageMeterSettings {
  return useClientSettingsValue().usageMeter;
}

/**
 * Hold-to-talk dictation config. Held at the defaults (which are off) until
 * client settings hydrate, so a cold load never offers dictation with an empty
 * key and then swaps the button's meaning a frame later.
 */
export function useVoiceDictationSettings(): VoiceDictationSettings {
  const settingsHydrated = useClientSettingsHydrated();
  const voiceDictation = useClientSettingsValue().voiceDictation;
  return settingsHydrated ? voiceDictation : DEFAULT_CLIENT_SETTINGS.voiceDictation;
}

/**
 * The meter's display mode, held at `off` until client settings hydrate so a
 * user who turned the meter off never sees it flash in on a cold load.
 */
export function useUsageMeterMode(): UsageMeterMode {
  const settingsHydrated = useClientSettingsHydrated();
  const mode = useClientSettingsValue().usageMeter.mode;
  return settingsHydrated ? mode : "off";
}

/** Read current settings for one environment, merged with client-local preferences. */
export function useEnvironmentSettings<T = UnifiedSettings>(
  environmentId: EnvironmentId,
  selector?: (settings: UnifiedSettings) => T,
): T {
  const serverSettings = useAtomValue(serverEnvironment.settingsValueAtom(environmentId));
  return useMergedSettings(serverSettings ?? DEFAULT_SERVER_SETTINGS, selector);
}

/** Primary-only settings access for the settings UI and other explicitly global surfaces. */
export function usePrimarySettings<T = UnifiedSettings>(
  selector?: (settings: UnifiedSettings) => T,
): T {
  return useMergedSettings(useAtomValue(primaryServerSettingsAtom), selector);
}

/**
 * Returns an updater for one environment's settings.
 *
 * UI-preference keys are folded into the nested `clientSettings` blob and ride
 * the same patch as the flat server keys, so a change touching both lands as
 * one write rather than two racing ones. The blob is replaced whole — see the
 * note on `ServerSettingsPatch.clientSettings`.
 */
function useUpdateSettingsTarget(environmentId: EnvironmentId | null) {
  const persistServerSettings = useAtomCommand(
    serverEnvironment.updateSettings,
    "server settings update",
  );
  const updateSettings = useCallback(
    (patch: UnifiedSettingsPatch) => {
      if (!environmentId) {
        return;
      }
      const { serverPatch, clientPatch } = splitPatch(patch);
      const merged: ServerSettingsPatch =
        Object.keys(clientPatch).length > 0
          ? {
              ...serverPatch,
              clientSettings: { ...readClientSettingsSnapshot(), ...clientPatch },
            }
          : serverPatch;

      if (Object.keys(merged).length === 0) {
        return;
      }
      void persistServerSettings({ environmentId, input: { patch: merged } });
    },
    [environmentId, persistServerSettings],
  );

  return updateSettings;
}

export function useUpdateEnvironmentSettings(environmentId: EnvironmentId) {
  return useUpdateSettingsTarget(environmentId);
}

export function useUpdatePrimarySettings() {
  return useUpdateSettingsTarget(usePrimaryEnvironment()?.environmentId ?? null);
}

export function useUpdateClientSettings() {
  const updateSettings = useUpdatePrimarySettings();
  return useCallback(
    (patch: ClientSettingsPatch) => {
      updateSettings(patch);
    },
    [updateSettings],
  );
}

/**
 * One-time lift of the pre-move localStorage blob into server settings.
 *
 * Runs once the primary server's settings have arrived, and only while the
 * server still holds untouched defaults: a server that already has stored
 * preferences is the newer source of truth, and a stale blob left behind in
 * some browser must not overwrite it. The local key is cleared either way, so
 * this cannot fire twice on the same origin.
 */
export function useClientSettingsMigration(): void {
  const updateSettings = useUpdatePrimarySettings();
  const serverConfig = useAtomValue(primaryServerConfigAtom);
  const serverSettings = useAtomValue(primaryServerSettingsAtom);
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current || serverConfig === null) {
      return;
    }
    attempted.current = true;

    // Theme was persisted under its own key, so it has to be picked up
    // separately rather than arriving inside the blob.
    const storedTheme = readBrowserThemePreference();
    const stored = readBrowserClientSettings();
    if (stored === null && storedTheme === null) {
      return;
    }

    if (isDefaultClientSettings(serverSettings.clientSettings)) {
      updateSettings({
        ...stored,
        ...(isAppThemeValue(storedTheme) ? { theme: storedTheme } : {}),
      });
    }
    clearBrowserClientSettings();
    // The theme cache is deliberately kept: `useTheme` reads it before first
    // paint, and dropping it here would reintroduce the flash it prevents.
  }, [serverConfig, serverSettings, updateSettings]);
}

function isAppThemeValue(value: string | null): value is AppThemePreference {
  return value !== null && (APP_THEME_VALUES as ReadonlyArray<string>).includes(value);
}

function isDefaultClientSettings(settings: ClientSettings): boolean {
  return Struct.keys(DEFAULT_CLIENT_SETTINGS).every(
    (key) => JSON.stringify(settings[key]) === JSON.stringify(DEFAULT_CLIENT_SETTINGS[key]),
  );
}

export function __resetClientSettingsPersistenceForTests(): void {
  clientSettingsTestOverride = null;
}

export function __setClientSettingsForTests(settings: ClientSettings): void {
  clientSettingsTestOverride = settings;
}
