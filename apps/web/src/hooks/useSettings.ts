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
import { useEffect, useRef, useSyncExternalStore, use } from "react";
import { useSyncExternalStoreWithSelector } from "use-sync-external-store/with-selector";
import { RegistryContext, useAtomValue } from "@effect/atom-react";
import {
  DEFAULT_SERVER_SETTINGS,
  AuthSettingsWriteScope,
  requiredScopesForServerSettingsPatch,
  type EnvironmentId,
  type ProviderInstanceMutation,
  type ProviderInstanceId,
  ServerSettings,
  type ServerSettingsPatch,
  sessionGrantsScope,
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
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import {
  filterSharedServerPatch,
  findSharedSettingsMismatches,
  pickSharedServerSettings,
  splitSharedServerPatch,
  supportsSharedSettingsSync,
} from "@t3tools/client-runtime/state/shared-settings";
import {
  getThemeDefinition,
  getThemePreviewSidebarArtwork,
  resolveThemeHalf,
  subscribeToThemePreview,
  themeAllowsSidebarArtwork,
} from "~/themePalette";
import {
  modelPreferencesMigrationPatch,
  resolveModelPreferences,
} from "@t3tools/shared/serverSettings";
import * as Equal from "effect/Equal";
import * as Struct from "effect/Struct";
import { primaryEnvironmentIdAtom } from "~/state/primaryEnvironment";
import {
  primaryServerConfigAtom,
  primaryServerSettingsAtom,
  serverEnvironment,
} from "~/state/server";
import * as Option from "effect/Option";
import { AsyncResult, Atom } from "effect/reactivity";
import { toastManager } from "~/components/ui/toast";
import { isHostedStaticApp } from "~/hostedPairing";
import { environmentCatalog } from "~/connection/catalog";
import { useEnvironments, usePrimaryEnvironment } from "~/state/environments";
import { runAtomCommand } from "@t3tools/client-runtime/state/runtime";
import { useAtomCommand } from "~/state/use-atom-command";
import { useTheme } from "./useTheme";
import {
  environmentSession,
  environmentSessionStatesAtom,
  readEnvironmentScope,
  useEnvironmentScope,
} from "~/state/session";
import { environmentIdsKey } from "~/state/environmentAtomList";
import { appAtomRegistry } from "~/rpc/atomRegistry";

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

export function getClientSettings(): ClientSettings {
  return readClientSettingsSnapshot();
}

/** Client settings ride the primary server's settings, so that atom is the change signal. */
export function subscribeClientSettings(listener: () => void): () => void {
  return appAtomRegistry.subscribe(primaryServerSettingsAtom, listener);
}

export function getClientSettingsHydratedSnapshot(): boolean {
  return (
    clientSettingsTestOverride !== null || appAtomRegistry.get(primaryServerConfigAtom) !== null
  );
}

export function subscribeClientSettingsHydration(listener: () => void): () => void {
  return appAtomRegistry.subscribe(primaryServerConfigAtom, listener);
}

export function isClientSettingsHydrated(): boolean {
  return getClientSettingsHydratedSnapshot();
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
  const serverConfig = useAtomValue(primaryServerConfigAtom);
  // Matches ensureClientSettingsHydrated: a test override counts as hydrated.
  return clientSettingsTestOverride !== null || serverConfig !== null;
}

/** Void reads settings from the server config, so there is no failed state. */
export function useClientSettingsHydrationStatus(): "pending" | "ready" {
  return useClientSettingsHydrated() ? "ready" : "pending";
}

const getDefaultClientSettings = () => DEFAULT_CLIENT_SETTINGS;
const selectWholeClientSettings = (settings: ClientSettings) => settings;

/**
 * The selection, not the whole snapshot, is what the store compares, so a write re-renders only
 * readers whose selected value changed. Selectors may build objects or arrays: a structurally
 * equal result keeps the previous reference.
 *
 * Void's client settings ride the primary server's config, so the store is that atom.
 */
export function useClientSettings<T = ClientSettings>(
  selector?: (settings: ClientSettings) => T,
): T {
  const registry = use(RegistryContext);
  return useSyncExternalStoreWithSelector(
    (listener) => registry.subscribe(primaryServerSettingsAtom, listener),
    () =>
      clientSettingsTestOverride ??
      registry.get(primaryServerSettingsAtom)?.clientSettings ??
      DEFAULT_CLIENT_SETTINGS,
    getDefaultClientSettings,
    selector ?? (selectWholeClientSettings as (settings: ClientSettings) => T),
    Equal.equals,
  );
}

export function mergeEnvironmentSettings(
  serverSettings: ServerSettings,
  clientSettings: ClientSettings,
): UnifiedSettings {
  // Decode drops retired client keys, but older untyped persistence adapters
  // can still return them. Server-owned values must always win.
  return {
    ...clientSettings,
    ...serverSettings,
    ...resolveModelPreferences(serverSettings, clientSettings),
  };
}

const selectLegacyModelPreferences = (settings: ClientSettings) => ({
  favorites: settings.favorites,
  providerModelPreferences: settings.providerModelPreferences,
});

// Servers that predate `migrateModelPreferences` drop it and keep reporting null favorites.
const attemptedMigrationGenerations = new Map<EnvironmentId, number>();

const modelPreferencesMigrationTargetsAtom = Atom.make((get) =>
  [...get(environmentCatalog.catalogValueAtom).entries.keys()].flatMap((environmentId) => {
    const generation = Option.match(
      AsyncResult.value(get(environmentCatalog.stateAtom(environmentId))),
      {
        onNone: () => null,
        onSome: (connection) => (connection.phase === "connected" ? connection.generation : null),
      },
    );
    const settings = get(serverEnvironment.settingsValueAtom(environmentId));
    return generation === null || settings === null
      ? []
      : [{ environmentId, generation, settings }];
  }),
).pipe(Atom.withLabel("web-model-preferences-migration-targets"));

function migrateModelPreferences(): void {
  if (!getClientSettingsHydratedSnapshot()) return;
  const clientSettings = readClientSettingsSnapshot();
  for (const { environmentId, generation, settings } of appAtomRegistry.get(
    modelPreferencesMigrationTargetsAtom,
  )) {
    if (attemptedMigrationGenerations.get(environmentId) === generation) continue;
    const patch = modelPreferencesMigrationPatch(settings, clientSettings);
    if (!patch) continue;
    attemptedMigrationGenerations.set(environmentId, generation);
    void runAtomCommand(
      appAtomRegistry,
      serverEnvironment.updateSettings,
      { environmentId, input: { patch } },
      { reportFailure: false },
    );
  }
}

/** Moves this client's legacy model preferences onto each server, once per connection. */
export function startModelPreferencesMigration(): () => void {
  const unsubscribes = [
    appAtomRegistry.subscribe(modelPreferencesMigrationTargetsAtom, migrateModelPreferences),
    subscribeClientSettings(migrateModelPreferences),
    subscribeClientSettingsHydration(migrateModelPreferences),
  ];
  migrateModelPreferences();
  return () => {
    for (const unsubscribe of unsubscribes) unsubscribe();
  };
}

/** Selecting inside the client store keeps a client write from re-rendering unaffected readers. */
export function useMergedSettings<T = UnifiedSettings>(
  serverSettings: ServerSettings,
  selector?: (settings: UnifiedSettings) => T,
): T {
  return useClientSettings((clientSettings) => {
    const merged = mergeEnvironmentSettings(serverSettings, clientSettings);
    return selector ? selector(merged) : (merged as T);
  });
}

function resolveEnvironmentIdentificationMode(input: {
  mode: EnvironmentIdentificationMode;
  settingsHydrated: boolean;
  paletteThemeActive?: boolean;
  paletteThemeAllowsArtwork?: boolean;
}): EnvironmentIdentificationMode {
  if (!input.settingsHydrated) return "none";
  const isArtwork = input.mode !== "pill" && input.mode !== "none";
  return input.paletteThemeActive && !input.paletteThemeAllowsArtwork && isArtwork
    ? "pill"
    : input.mode;
}

export function useEnvironmentIdentificationMode(): EnvironmentIdentificationMode {
  const settingsHydrated = useClientSettingsHydrated();
  const mode = useClientSettings((settings) => settings.environmentIdentificationMode);
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
 * Whether Void's own sidebar is in use. It is the fork's default, so this holds
 * at `true` until client settings hydrate: a cold load must not flash upstream's
 * sidebar before the persisted preference arrives.
 */
export function useVoidSidebarEnabled(): boolean {
  const settingsHydrated = useClientSettingsHydrated();
  const voidSidebarEnabled = useClientSettings((settings) => settings.voidSidebarEnabled);
  return settingsHydrated ? voidSidebarEnabled : true;
}

/** Legacy sidebar opt-ins still count, so those users land in the boring sidebar. */
export function useBoringSidebarEnabled(): boolean {
  return useClientSettings(
    (settings) => settings.boringSidebarEnabled || settings.legacySidebarEnabled,
  );
}

/** Presentation of the sidebar provider usage meter. */
export function useUsageMeterSettings(): UsageMeterSettings {
  return useClientSettings((settings) => settings.usageMeter);
}

/**
 * Hold-to-talk dictation config. Held at the defaults (which are off) until
 * client settings hydrate, so a cold load never offers dictation with an empty
 * key and then swaps the button's meaning a frame later.
 */
export function useVoiceDictationSettings(): VoiceDictationSettings {
  const settingsHydrated = useClientSettingsHydrated();
  const voiceDictation = useClientSettings((settings) => settings.voiceDictation);
  return settingsHydrated ? voiceDictation : DEFAULT_CLIENT_SETTINGS.voiceDictation;
}

/**
 * The meter's display mode, held at `off` until client settings hydrate so a
 * user who turned the meter off never sees it flash in on a cold load.
 */
export function useUsageMeterMode(): UsageMeterMode {
  const settingsHydrated = useClientSettingsHydrated();
  const mode = useClientSettings((settings) => settings.usageMeter.mode);
  return settingsHydrated ? mode : "off";
}

export async function prepareModelPreferencesPatch(
  settings: ServerSettings,
  patch: ServerSettingsPatch,
): Promise<ServerSettingsPatch> {
  if (settings.favorites === null || settings.providerModelPreferences === null) {
    await ensureClientSettingsHydrated();
  }
  return { ...modelPreferencesMigrationPatch(settings, getClientSettings()), ...patch };
}

export function useUpdateEnvironmentModelPreferences(environmentId: EnvironmentId | null) {
  const settings = useAtomValue(
    environmentId ? serverEnvironment.settingsValueAtom(environmentId) : noEnvironmentSettingsAtom,
  );
  const save = useAtomCommand(serverEnvironment.updateSettings, "model preferences update");
  return async (patch: ServerSettingsPatch) => {
    if (!environmentId || !settings) return;
    let prepared: ServerSettingsPatch;
    try {
      prepared = await prepareModelPreferencesPatch(settings, patch);
    } catch {
      toastManager.add({
        type: "error",
        title: "Model preferences not saved",
        description: "Could not load saved model preferences. Try again.",
      });
      return;
    }
    return save({ environmentId, input: { patch: prepared } });
  };
}

/** Send the desired state so two clients adding a favorite do not cancel each other. */
export function useToggleEnvironmentModelFavorite(environmentId: EnvironmentId | null) {
  const registry = use(RegistryContext);
  const pendingFavorites = useRef(
    new Map<string, { favorite: boolean; settings: ServerSettings; pending: boolean }>(),
  );
  const save = useUpdateEnvironmentModelPreferences(environmentId);
  return async (provider: ProviderInstanceId, model: string) => {
    if (!environmentId) return;
    const settingsAtom = serverEnvironment.settingsValueAtom(environmentId);
    const settings = registry.get(settingsAtom);
    if (!settings) return;
    if (settings.favorites === null) {
      try {
        await ensureClientSettingsHydrated();
      } catch {
        toastManager.add({
          type: "error",
          title: "Favorites not saved",
          description: "Could not load saved model preferences. Try again.",
        });
        return;
      }
    }
    const currentSettings = registry.get(settingsAtom) ?? settings;
    const favorites = resolveModelPreferences(currentSettings, getClientSettings()).favorites;
    const key = JSON.stringify([environmentId, provider, model]);
    const previous = pendingFavorites.current.get(key);
    // Keep the acknowledged choice until the config stream catches up with the RPC reply.
    const previousFavorite =
      previous && (previous.pending || previous.settings.favorites === currentSettings.favorites)
        ? previous.favorite
        : favorites.some((favorite) => favorite.provider === provider && favorite.model === model);
    const pending = {
      favorite: !previousFavorite,
      settings: currentSettings,
      pending: true,
    };
    pendingFavorites.current.set(key, pending);
    // save settles into a result and never rejects, so the rollback below always runs.
    const result = await save({
      setModelFavorites: [{ provider, model, favorite: pending.favorite }],
    });
    if (
      result &&
      AsyncResult.isSuccess(result) &&
      registry.get(settingsAtom)?.favorites === currentSettings.favorites
    ) {
      pending.pending = false;
    }
    if (pending.pending && pendingFavorites.current.get(key) === pending) {
      if (
        previous &&
        !previous.pending &&
        registry.get(settingsAtom)?.favorites === previous.settings.favorites
      ) {
        pendingFavorites.current.set(key, previous);
      } else {
        pendingFavorites.current.delete(key);
      }
    }
  };
}

const noEnvironmentSettingsAtom = Atom.make<ServerSettings | null>(null);

export function useEnvironmentModelPreferences(environmentId: EnvironmentId | null) {
  const settings = useAtomValue(
    environmentId ? serverEnvironment.settingsValueAtom(environmentId) : noEnvironmentSettingsAtom,
  );
  const legacy = useClientSettings(selectLegacyModelPreferences);
  return resolveModelPreferences(settings ?? DEFAULT_SERVER_SETTINGS, legacy);
}

export function useEnvironmentSettings<T = UnifiedSettings>(
  environmentId: EnvironmentId,
  selector?: (settings: UnifiedSettings) => T,
): T {
  const serverSettings = useAtomValue(serverEnvironment.settingsValueAtom(environmentId));
  return useMergedSettings(serverSettings ?? DEFAULT_SERVER_SETTINGS, selector);
}

export function usePersistEnvironmentProviderInstanceMutation(environmentId: EnvironmentId) {
  const mutateProviderInstance = useAtomCommand(serverEnvironment.mutateProviderInstance, {
    reportFailure: false,
  });
  return (providerInstanceMutation: ProviderInstanceMutation, patch: ServerSettingsPatch = {}) =>
    mutateProviderInstance({
      environmentId,
      input: { patch, providerInstanceMutation },
    });
}

export function usePrimarySettings<T = UnifiedSettings>(
  selector?: (settings: UnifiedSettings) => T,
): T {
  const settings = useAtomValue(primaryServerSettingsAtom);
  return useMergedSettings(settings, selector);
}

export const PRIMARY_SETTINGS_UNAVAILABLE_MESSAGE =
  "This setting is saved on a server, and the hosted app is not anchored to one. Change it from the desktop app or from the server's own address.";

/**
 * The hosted app connects to every environment as a remote, so it has no
 * primary: `usePrimarySettings` reads schema defaults there and writes have
 * nowhere to go.
 */
export function usePrimarySettingsAvailable(): boolean {
  const primaryEnvironment = usePrimaryEnvironment();
  return primaryEnvironment !== null || !isHostedStaticApp();
}

function useSharedSettingsSyncTargetIds(includePending = false): ReadonlyArray<EnvironmentId> {
  const { environments } = useEnvironments();
  const targetIds = environments
    .filter(supportsSharedSettingsSync)
    .map(({ environmentId }) => environmentId);
  const results = useAtomValue(environmentSessionStatesAtom(environmentIdsKey(targetIds)));
  return targetIds.flatMap((environmentId, index) => {
    const result = results[index]!;
    // A cold grant must not drop a shared edit. The server authorizes the
    // write; mismatch suggestions still wait for a confirmed grant.
    if (includePending && result._tag === "Initial") {
      return [environmentId];
    }
    const session = result._tag === "Failure" ? null : AsyncResult.getOrElse(result, () => null);
    return session !== null && sessionGrantsScope(session, AuthSettingsWriteScope)
      ? [environmentId]
      : [];
  });
}

/**
 * Returns an updater for one environment's settings.
 *
 * UI-preference keys are folded into the nested `clientSettings` blob and ride
 * the same write as target-local server keys. Shared server keys are written
 * to every connected environment so they do not drift between machines.
 */
function useUpdateSettingsTarget(environmentId: EnvironmentId | null) {
  useEnvironmentScope(environmentId, AuthSettingsWriteScope);
  const persist = useAtomCommand(serverEnvironment.updateSettings, {
    label: "server settings update",
    reportFailure: false,
  });
  const { environments } = useEnvironments();
  const persistServerSettings = async (request: Parameters<typeof persist>[0]) => {
    const result = await persist(request);
    if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
      const label =
        environments.find((environment) => environment.environmentId === request.environmentId)
          ?.label ?? request.environmentId;
      const error = squashAtomCommandFailure(result);
      toastManager.add({
        type: "error",
        title: "Setting not saved",
        description: `Could not save on ${label}: ${error instanceof Error ? error.message : "The save failed. Try reconnecting and saving again."}`,
      });
    }
    return result;
  };
  const sharedSettingsSyncTargetIds = useSharedSettingsSyncTargetIds(true);
  const updateSettings = (patch: UnifiedSettingsPatch) => {
    const { serverPatch, clientPatch } = splitPatch(patch);
    const { sharedPatch, localPatch } = splitSharedServerPatch(serverPatch);
    const targetPatch: ServerSettingsPatch =
      Object.keys(clientPatch).length > 0
        ? {
            ...localPatch,
            clientSettings: { ...readClientSettingsSnapshot(), ...clientPatch },
          }
        : localPatch;
    // Dropping the write silently leaves the control looking saved.
    const warnUnsaved = (description = PRIMARY_SETTINGS_UNAVAILABLE_MESSAGE) =>
      toastManager.add({
        type: "warning",
        title: "Setting not saved",
        description,
      });

    if (Object.keys(targetPatch).length > 0) {
      if (!environmentId) {
        warnUnsaved();
      } else if (
        // A cold grant must not drop the write: UI preferences save on their
        // own during startup. The server still authorizes it.
        appAtomRegistry.get(environmentSession.sessionStateAtom(environmentId))._tag !==
          "Initial" &&
        !requiredScopesForServerSettingsPatch(targetPatch).every((scope) =>
          readEnvironmentScope(environmentId, scope),
        )
      ) {
        warnUnsaved(
          `This connection lacks permission to change settings on ${environments.find((target) => target.environmentId === environmentId)?.label ?? "the selected environment"}.`,
        );
      } else {
        void persistServerSettings({ environmentId, input: { patch: targetPatch } });
      }
    }

    if (Object.keys(sharedPatch).length > 0) {
      const targets = new Set<EnvironmentId>(sharedSettingsSyncTargetIds);
      if (environmentId) targets.add(environmentId);
      if (targets.size === 0) warnUnsaved();
      for (const targetId of targets) {
        void persistServerSettings({ environmentId: targetId, input: { patch: sharedPatch } });
      }
    }
  };

  return updateSettings;
}

/**
 * Shared-settings sync targets whose values differ from the primary's,
 * plus an action that writes the primary's values to all of them. Drift
 * happens when an environment was offline during an edit or was changed by
 * an older client.
 */
export function useSharedSettingsSync() {
  const primaryEnvironment = usePrimaryEnvironment();
  const primaryEnvironmentId = primaryEnvironment?.environmentId ?? null;
  // Read the loaded config, not `primaryServerSettingsAtom`: that atom falls
  // back to defaults while the primary is disconnected, and "apply to all"
  // must never push defaults over real values. Same for a primary too old to
  // hold the shared keys: its decoded defaults are not a source of truth.
  const primarySettings =
    primaryEnvironment !== null && supportsSharedSettingsSync(primaryEnvironment)
      ? (primaryEnvironment.serverConfig?.settings ?? null)
      : null;
  const { environments } = useEnvironments();
  const persistServerSettings = useAtomCommand(
    serverEnvironment.updateSettings,
    "server settings update",
  );

  const mismatches = findSharedSettingsMismatches({
    primaryEnvironmentId,
    primarySettings,
    environments: environments.map((environment) => ({
      environmentId: environment.environmentId,
      label: environment.label,
      syncEligible: supportsSharedSettingsSync(environment),
      settings: environment.serverConfig?.settings ?? null,
    })),
  });

  const applyToAll = () => {
    if (primarySettings === null) {
      return;
    }
    const patch = pickSharedServerSettings(primarySettings);
    for (const mismatch of mismatches) {
      const target = environments.find(
        (candidate) => candidate.environmentId === mismatch.environmentId,
      );
      void persistServerSettings({
        environmentId: mismatch.environmentId,
        input: {
          patch: filterSharedServerPatch(patch, target?.serverConfig?.settings, primarySettings),
        },
      });
    }
  };

  return { mismatches, applyToAll };
}

export function useUpdateEnvironmentSettings(environmentId: EnvironmentId | null) {
  return useUpdateSettingsTarget(environmentId);
}

export function useUpdatePrimarySettings() {
  return useUpdateSettingsTarget(usePrimaryEnvironment()?.environmentId ?? null);
}

/** Void's own write path: folds the patch into the primary server's `clientSettings`. */
export function useUpdateClientSettings() {
  const updateSettings = useUpdatePrimarySettings();
  return (patch: ClientSettingsPatch) => {
    updateSettings(patch);
  };
}

export function updateClientSettings(patch: ClientSettingsPatch): Promise<void> {
  return persistClientSettingsUpdate((current) => ({ ...current, ...patch })).then(
    () => undefined,
    (error: unknown) => {
      // Dropping the write silently leaves the control looking saved.
      toastManager.add({
        type: "warning",
        title: "Setting not saved",
        description: error instanceof Error ? error.message : PRIMARY_SETTINGS_UNAVAILABLE_MESSAGE,
      });
    },
  );
}

/**
 * Imperative client-settings write for the non-React call sites.
 *
 * Void keeps UI preferences in the server's settings.json, so a write is an
 * RPC rather than a localStorage set. The updater runs against the freshest
 * snapshot, and the resolved value is exactly what was sent.
 */
export async function persistClientSettingsUpdate(
  update: (current: ClientSettings) => ClientSettings,
): Promise<ClientSettings> {
  await ensureClientSettingsHydrated();
  const environmentId = appAtomRegistry.get(primaryEnvironmentIdAtom);
  if (!environmentId) {
    throw new Error("No primary environment is connected, so settings cannot be saved.");
  }
  const next = update(readClientSettingsSnapshot());
  const result = await runAtomCommand(
    appAtomRegistry,
    serverEnvironment.updateSettings,
    { environmentId, input: { patch: { clientSettings: next } } },
    { label: "client settings update" },
  );
  if (result._tag === "Failure") {
    throw squashAtomCommandFailure(result);
  }
  return next;
}

/** Fire-and-forget form of {@link persistClientSettingsUpdate}. */
export function persistClientSettingsPatch(patch: ClientSettingsPatch): void {
  void persistClientSettingsUpdate((current) => ({ ...current, ...patch }));
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
