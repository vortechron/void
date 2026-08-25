import * as Effect from "effect/Effect";
import * as Duration from "effect/Duration";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as SchemaTransformation from "effect/SchemaTransformation";
import { TrimmedNonEmptyString, TrimmedString } from "./baseSchemas.ts";
import { ThreadEnvMode } from "./environment.ts";
import {
  DEFAULT_TEXT_GENERATION_MODEL,
  DEFAULT_TEXT_GENERATION_REASONING_EFFORT,
  ProviderOptionSelections,
} from "./model.ts";
import { ModelSelection, ProjectPromptAction, ProjectScript } from "./orchestration.ts";
import {
  DEFAULT_PREVIEW_APPEARANCE,
  DEFAULT_PREVIEW_ZOOM_FACTOR,
  FILL_PREVIEW_VIEWPORT,
  PreviewAppearancePreference,
  PreviewViewportSetting,
  PreviewZoomFactor,
} from "./preview.ts";
import {
  ProviderInstanceConfig,
  ProviderInstanceId,
  type ProviderDriverKind,
} from "./providerInstance.ts";

// ── Client Settings (local-only) ───────────────────────────────

export const TimestampFormat = Schema.Literals(["locale", "12-hour", "24-hour"]);
export type TimestampFormat = typeof TimestampFormat.Type;
export const DEFAULT_TIMESTAMP_FORMAT: TimestampFormat = "locale";

export const SidebarProjectSortOrder = Schema.Literals(["updated_at", "created_at", "manual"]);
export type SidebarProjectSortOrder = typeof SidebarProjectSortOrder.Type;
export const DEFAULT_SIDEBAR_PROJECT_SORT_ORDER: SidebarProjectSortOrder = "updated_at";

export const SidebarThreadSortOrder = Schema.Literals(["updated_at", "created_at"]);
export type SidebarThreadSortOrder = typeof SidebarThreadSortOrder.Type;
export const DEFAULT_SIDEBAR_THREAD_SORT_ORDER: SidebarThreadSortOrder = "updated_at";

export const SidebarProjectGroupingMode = Schema.Literals([
  "repository",
  "repository_path",
  "separate",
]);
export type SidebarProjectGroupingMode = typeof SidebarProjectGroupingMode.Type;
export const DEFAULT_SIDEBAR_PROJECT_GROUPING_MODE: SidebarProjectGroupingMode = "repository";

// A user-defined bucket of sidebar projects. Unrelated to
// `SidebarProjectGroupingMode`, which decides whether one repository checked
// out in several environments collapses into a single row; this is the
// hand-curated "show me only my work projects" filter. `projectKeys` holds
// logical project keys and a key may appear in several groups at once.
export const SidebarProjectGroup = Schema.Struct({
  id: TrimmedNonEmptyString,
  name: TrimmedNonEmptyString,
  projectKeys: Schema.Array(TrimmedNonEmptyString).pipe(
    Schema.withDecodingDefault(Effect.succeed([])),
  ),
});
export type SidebarProjectGroup = typeof SidebarProjectGroup.Type;
export const MIN_SIDEBAR_THREAD_PREVIEW_COUNT = 1;
export const MAX_SIDEBAR_THREAD_PREVIEW_COUNT = 15;
export const SidebarThreadPreviewCount = Schema.Int.check(
  Schema.isBetween({
    minimum: MIN_SIDEBAR_THREAD_PREVIEW_COUNT,
    maximum: MAX_SIDEBAR_THREAD_PREVIEW_COUNT,
  }),
);
export type SidebarThreadPreviewCount = typeof SidebarThreadPreviewCount.Type;
export const DEFAULT_SIDEBAR_THREAD_PREVIEW_COUNT: SidebarThreadPreviewCount = 6;
export const MIN_SIDEBAR_AUTO_SETTLE_AFTER_DAYS = 1;
export const MAX_SIDEBAR_AUTO_SETTLE_AFTER_DAYS = 90;
export const SidebarAutoSettleAfterDays = Schema.Number.check(
  Schema.isBetween({
    minimum: MIN_SIDEBAR_AUTO_SETTLE_AFTER_DAYS,
    maximum: MAX_SIDEBAR_AUTO_SETTLE_AFTER_DAYS,
  }),
);
export type SidebarAutoSettleAfterDays = typeof SidebarAutoSettleAfterDays.Type;
export const DEFAULT_SIDEBAR_AUTO_SETTLE_AFTER_DAYS: SidebarAutoSettleAfterDays = 3;
export const MIN_GLASS_OPACITY = 40;
export const MAX_GLASS_OPACITY = 100;
export const GlassOpacity = Schema.Int.check(
  Schema.isBetween({
    minimum: MIN_GLASS_OPACITY,
    maximum: MAX_GLASS_OPACITY,
  }),
);
export type GlassOpacity = typeof GlassOpacity.Type;
export const DEFAULT_GLASS_OPACITY: GlassOpacity = 80;
export const MAX_FONT_FAMILY_NAME_LENGTH = 256;
export const FontFamilyName = TrimmedNonEmptyString.check(
  Schema.isMaxLength(MAX_FONT_FAMILY_NAME_LENGTH),
);
export type FontFamilyName = typeof FontFamilyName.Type;
export const UiFontFamily = FontFamilyName;
export type UiFontFamily = typeof UiFontFamily.Type;
export const DEFAULT_UI_FONT_FAMILY: UiFontFamily = "dm-sans";
export const MIN_UI_FONT_SIZE = 12;
export const MAX_UI_FONT_SIZE = 20;
export const UiFontSize = Schema.Int.check(
  Schema.isBetween({ minimum: MIN_UI_FONT_SIZE, maximum: MAX_UI_FONT_SIZE }),
);
export type UiFontSize = typeof UiFontSize.Type;
export const DEFAULT_UI_FONT_SIZE: UiFontSize = 16;
export const CodeFontFamily = FontFamilyName;
export type CodeFontFamily = typeof CodeFontFamily.Type;
export const DEFAULT_CODE_FONT_FAMILY: CodeFontFamily = "system-mono";
export const MIN_CODE_FONT_SIZE = 10;
export const MAX_CODE_FONT_SIZE = 20;
export const CodeFontSize = Schema.Int.check(
  Schema.isBetween({ minimum: MIN_CODE_FONT_SIZE, maximum: MAX_CODE_FONT_SIZE }),
);
export type CodeFontSize = typeof CodeFontSize.Type;
export const DEFAULT_CODE_FONT_SIZE: CodeFontSize = 13;
export const CodeTheme = Schema.Literals([
  "default",
  "catppuccin-latte",
  "catppuccin-macchiato",
  "catppuccin-mocha",
  "dracula",
  "nord",
  "tokyo-night",
  "gruvbox-dark",
  "solarized-dark",
]);
export type CodeTheme = typeof CodeTheme.Type;
export const DEFAULT_CODE_THEME: CodeTheme = "default";
export const EnvironmentIdentificationMode = Schema.Literals(["artwork", "pill", "none"]);
export type EnvironmentIdentificationMode = typeof EnvironmentIdentificationMode.Type;
export const DEFAULT_ENVIRONMENT_IDENTIFICATION_MODE: EnvironmentIdentificationMode = "artwork";
export const CompletionSound = Schema.Literals(["none", "chime"]);
export type CompletionSound = typeof CompletionSound.Type;
export const DEFAULT_COMPLETION_SOUND: CompletionSound = "chime";

// ── Chat ambient effects ─────────────────────────────────────────────
//
// Two independent choices, because they decorate two different surfaces and
// are not alternatives to each other: one fills the chat column behind the
// new-thread hero, the other traces the composer's own box. Picking a
// background never costs you the border, and vice versa.
//
// The names live here so the schema that validates the persisted choice and
// the list the picker renders cannot drift apart. Adding an effect means
// adding a value here plus a renderer in the web registry — nothing else
// knows these names.

/** Ambient animation drawn behind the new-thread hero, filling the chat column. */
export const CHAT_BACKGROUND_EFFECT_VALUES = ["none", "meteors"] as const;
export const ChatBackgroundEffect = Schema.Literals(CHAT_BACKGROUND_EFFECT_VALUES);
export type ChatBackgroundEffect = typeof ChatBackgroundEffect.Type;
/** Off by default: an ambient effect repaints continuously, so it is opt-in. */
export const DEFAULT_CHAT_BACKGROUND_EFFECT: ChatBackgroundEffect = "none";

/** Ambient animation tracing the composer's border on the new-thread hero. */
export const CHAT_BORDER_EFFECT_VALUES = ["none", "ripple"] as const;
export const ChatBorderEffect = Schema.Literals(CHAT_BORDER_EFFECT_VALUES);
export type ChatBorderEffect = typeof ChatBorderEffect.Type;
/** Off by default, for the same reason as the background effect. */
export const DEFAULT_CHAT_BORDER_EFFECT: ChatBorderEffect = "none";

// ── Provider usage meter ─────────────────────────────────────────────
//
// Presentation of the sidebar meter that renders the subscription usage the
// providers report for themselves (see `providerUsage.ts`).

/** Whether a window reads as the share already spent or the share still left. */
export const UsageMeterPercentageBasis = Schema.Literals(["used", "remaining"]);
export type UsageMeterPercentageBasis = typeof UsageMeterPercentageBasis.Type;
export const DEFAULT_USAGE_METER_PERCENTAGE_BASIS: UsageMeterPercentageBasis = "used";

export const UsageMeterChartStyle = Schema.Literals([
  "ring",
  "bar",
  "stepped",
  "numeric",
  "sparkline",
]);
export type UsageMeterChartStyle = typeof UsageMeterChartStyle.Type;
export const DEFAULT_USAGE_METER_CHART_STYLE: UsageMeterChartStyle = "ring";

/** `minimized` is the one-pill-per-provider row; `off` hides the meter entirely. */
export const UsageMeterMode = Schema.Literals(["expanded", "minimized", "off"]);
export type UsageMeterMode = typeof UsageMeterMode.Type;
export const DEFAULT_USAGE_METER_MODE: UsageMeterMode = "expanded";

/**
 * Allowed periodic re-sync intervals, in seconds. `0` turns the timer off and
 * leaves the meter on the server's live push alone. A closed set rather than a
 * free number because the control is a picker either way, and an arbitrary
 * small value would re-establish the usage subscription in a tight loop.
 */
export const USAGE_METER_REFRESH_INTERVAL_SECONDS_VALUES = [0, 60, 300, 900, 1800, 3600] as const;
export const UsageMeterRefreshIntervalSeconds = Schema.Literals(
  USAGE_METER_REFRESH_INTERVAL_SECONDS_VALUES,
);
export type UsageMeterRefreshIntervalSeconds = typeof UsageMeterRefreshIntervalSeconds.Type;
export const DEFAULT_USAGE_METER_REFRESH_INTERVAL_SECONDS: UsageMeterRefreshIntervalSeconds = 300;

export const UsageMeterSettings = Schema.Struct({
  mode: UsageMeterMode.pipe(Schema.withDecodingDefault(Effect.succeed(DEFAULT_USAGE_METER_MODE))),
  percentageBasis: UsageMeterPercentageBasis.pipe(
    Schema.withDecodingDefault(Effect.succeed(DEFAULT_USAGE_METER_PERCENTAGE_BASIS)),
  ),
  chartStyle: UsageMeterChartStyle.pipe(
    Schema.withDecodingDefault(Effect.succeed(DEFAULT_USAGE_METER_CHART_STYLE)),
  ),
  refreshIntervalSeconds: UsageMeterRefreshIntervalSeconds.pipe(
    Schema.withDecodingDefault(Effect.succeed(DEFAULT_USAGE_METER_REFRESH_INTERVAL_SECONDS)),
  ),
}).pipe(Schema.withDecodingDefault(Effect.succeed({})));
export type UsageMeterSettings = typeof UsageMeterSettings.Type;

// ── Voice dictation ──────────────────────────────────────────────────
//
// Hold-to-talk on the composer's send button. The client streams
// microphone audio straight to OpenAI's realtime transcription endpoint
// and writes the transcript into the composer as it arrives; nothing is
// recorded to a file and the server is not in the audio path.

/**
 * OpenAI's streaming transcription models. `gpt-live-transcribe` emits
 * deltas while the user is still talking, which is what hold-to-talk
 * wants; `gpt-transcribe` only returns text once the turn is committed,
 * so it reads as a pause at the end of every hold.
 */
export const VOICE_DICTATION_MODEL_VALUES = ["gpt-live-transcribe", "gpt-transcribe"] as const;
export const VoiceDictationModel = Schema.Literals(VOICE_DICTATION_MODEL_VALUES);
export type VoiceDictationModel = typeof VoiceDictationModel.Type;
export const DEFAULT_VOICE_DICTATION_MODEL: VoiceDictationModel = "gpt-live-transcribe";

/**
 * What the cleanup pass does to a finished transcript.
 *
 * `off` is the raw transcript, exactly what the transcription model heard.
 * `cleanup` fixes punctuation, drops filler, and applies spoken
 * self-corrections while keeping the speaker's own words. `rewrite` goes
 * further and tightens rambling into sentences, which is the right trade
 * when the composer is being dictated into rather than typed in.
 */
export const VOICE_DICTATION_STYLE_VALUES = ["off", "cleanup", "rewrite"] as const;
export const VoiceDictationStyle = Schema.Literals(VOICE_DICTATION_STYLE_VALUES);
export type VoiceDictationStyle = typeof VoiceDictationStyle.Type;
export const DEFAULT_VOICE_DICTATION_STYLE: VoiceDictationStyle = "cleanup";

/**
 * The model the cleanup pass runs on, as free text rather than a closed set:
 * this one is named by OpenAI rather than by us, so a rename has to be
 * fixable in settings instead of waiting for a release.
 */
export const DEFAULT_VOICE_DICTATION_POLISH_MODEL = "gpt-4.1-mini";

/** Bounds on the two user-built lists, in the spirit of `MAX_KEYBINDINGS_COUNT`. */
export const MAX_VOICE_DICTIONARY_TERMS = 100;
export const MAX_VOICE_SNIPPETS = 50;

/** A spoken phrase and the text it expands into. */
export const VoiceDictationSnippet = Schema.Struct({
  id: TrimmedNonEmptyString,
  trigger: TrimmedNonEmptyString,
  replacement: TrimmedNonEmptyString,
});
export type VoiceDictationSnippet = typeof VoiceDictationSnippet.Type;

export const VoiceDictationSettings = Schema.Struct({
  /** Off by default: the feature needs a key the user has to supply. */
  enabled: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(false))),
  /**
   * Stored in plain text alongside the rest of the settings, and handed
   * to every paired client, because the browser is what opens the socket
   * to OpenAI. That is the same trust boundary a paired client already
   * has — it can run agents on this machine — but it does mean the key
   * is only as private as the environment's `settings.json`.
   */
  openaiApiKey: Schema.String.pipe(Schema.withDecodingDefault(Effect.succeed(""))),
  model: VoiceDictationModel.pipe(
    Schema.withDecodingDefault(Effect.succeed(DEFAULT_VOICE_DICTATION_MODEL)),
  ),
  /** ISO-639-1 hint, e.g. `en` or `ms`. Empty lets the model detect it. */
  language: Schema.String.pipe(Schema.withDecodingDefault(Effect.succeed(""))),
  style: VoiceDictationStyle.pipe(
    Schema.withDecodingDefault(Effect.succeed(DEFAULT_VOICE_DICTATION_STYLE)),
  ),
  /** Appended to the cleanup prompt verbatim. Empty is the common case. */
  styleInstructions: Schema.String.pipe(Schema.withDecodingDefault(Effect.succeed(""))),
  polishModel: Schema.String.pipe(
    Schema.withDecodingDefault(Effect.succeed(DEFAULT_VOICE_DICTATION_POLISH_MODEL)),
  ),
  /**
   * Names and jargon the transcription model would otherwise guess at. Sent
   * as a vocabulary hint on the session and again to the cleanup pass, so a
   * term that slips through the first is still caught by the second.
   */
  dictionary: Schema.Array(TrimmedNonEmptyString).pipe(
    Schema.withDecodingDefault(Effect.succeed([])),
  ),
  snippets: Schema.Array(VoiceDictationSnippet).pipe(
    Schema.withDecodingDefault(Effect.succeed([])),
  ),
  /**
   * The short tones and buzz that mark the microphone opening and closing.
   * On by default: the button is small and the user is usually looking
   * somewhere else by the time it starts listening, so without a cue there is
   * nothing telling them it did.
   */
  soundCues: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(true))),
}).pipe(Schema.withDecodingDefault(Effect.succeed({})));
export type VoiceDictationSettings = typeof VoiceDictationSettings.Type;

// ── Workspace chat surfaces (shared across devices) ──────────────────
//
// Which chats are open, and how workspaces are named/pinned/archived, used
// to live in each browser's localStorage. That is scoped per origin, so a
// chat started on a phone never showed up on the laptop — it was only
// reachable through the workspace's chat history menu. These ride the
// server-owned client settings for the same reason every other preference
// does: the server is the one thing every device shares.

/**
 * One open chat. Draft sessions are deliberately absent: a `DraftId` and its
 * reserved thread id only resolve in the browser that created them, so a
 * synced draft tab would point at nothing on the other device.
 */
export const WorkspaceThreadTab = Schema.Struct({
  environmentId: TrimmedNonEmptyString,
  threadId: TrimmedNonEmptyString,
});
export type WorkspaceThreadTab = typeof WorkspaceThreadTab.Type;

/**
 * Orders one device's edit against another's.
 *
 * Every publish carries `max(every version this device has seen) + 1`, so the
 * later edit always outranks the earlier one without anyone trusting anyone
 * else's clock. Content alone cannot do this: an empty set is both "I closed
 * everything just now" and "I have not synced yet", and without a counter the
 * second reading resurrects the tabs the first one closed.
 *
 * `0` means never published, which is what lets a browser that has only ever
 * had local tabs hand them over on first contact.
 */
export const WorkspaceSyncVersion = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));
export type WorkspaceSyncVersion = typeof WorkspaceSyncVersion.Type;

const workspaceSyncVersionField = WorkspaceSyncVersion.pipe(
  Schema.withDecodingDefault(Effect.succeed(0)),
);

/**
 * Open chats per workspace key, in tab-strip order.
 *
 * Which tab is *active* stays device-local: that is where a person is
 * looking right now, not a shared fact, and syncing it would make one device
 * yank the other's view mid-read.
 */
export const WorkspaceThreadTabsSettings = Schema.Struct({
  version: workspaceSyncVersionField,
  byWorkspaceKey: Schema.Record(TrimmedNonEmptyString, Schema.Array(WorkspaceThreadTab)).pipe(
    Schema.withDecodingDefault(Effect.succeed({})),
  ),
});
export type WorkspaceThreadTabsSettings = typeof WorkspaceThreadTabsSettings.Type;

/**
 * Stored form of the above. A value written by a build that kept the bare
 * record must not take the whole settings file down over a tab strip: it reads
 * as "never published" and the next local change republishes it in the current
 * shape. The bare schema above stays strict, so a client sending a bogus patch
 * is still rejected rather than silently reset — same split as
 * `chatBackgroundEffect`.
 */
const storedWorkspaceThreadTabs = WorkspaceThreadTabsSettings.pipe(
  Schema.catchDecoding(() => Effect.succeed(Option.some({ version: 0, byWorkspaceKey: {} }))),
  Schema.withDecodingDefault(Effect.succeed({})),
);

/** Per-workspace sidebar labelling. Renames, pins and archives are opinions
    about the work, not about the machine, so they travel — ordered by the
    same counter, so an unpin cannot be undone by a device that missed it. */
export const WorkspaceSidebarSettings = Schema.Struct({
  version: workspaceSyncVersionField,
  namesByWorkspaceKey: Schema.Record(TrimmedNonEmptyString, TrimmedNonEmptyString).pipe(
    Schema.withDecodingDefault(Effect.succeed({})),
  ),
  pinnedWorkspaceKeys: Schema.Array(TrimmedNonEmptyString).pipe(
    Schema.withDecodingDefault(Effect.succeed([])),
  ),
  archivedWorkspaceKeys: Schema.Array(TrimmedNonEmptyString).pipe(
    Schema.withDecodingDefault(Effect.succeed([])),
  ),
}).pipe(Schema.withDecodingDefault(Effect.succeed({})));
export type WorkspaceSidebarSettings = typeof WorkspaceSidebarSettings.Type;

// Unsent composer text deliberately does NOT travel. A prompt only has one
// safe reading when both sides can be ordered in time, and these values carry
// no timestamp: on a cold load, "empty here, text on the server" is either
// "never typed on this device" or "just sent from this device", and guessing
// the first resurrects a message the user already sent.

/**
 * Theme values live here rather than in the web app so the schema that
 * validates the persisted value and the list the theme picker renders cannot
 * drift apart. `appearancePreferences` re-exports this array.
 */
export const APP_THEME_VALUES = [
  "system",
  "light",
  "dark",
  "catppuccin-latte",
  "catppuccin-macchiato",
  "catppuccin-mocha",
  "dracula",
  "nord",
  "tokyo-night",
  "gruvbox-dark",
  "solarized-dark",
] as const;
export const AppThemePreference = Schema.Literals(APP_THEME_VALUES);
export type AppThemePreference = typeof AppThemePreference.Type;
export const DEFAULT_APP_THEME: AppThemePreference = "system";

/**
 * Defaults for the in-app preview browser, applied whenever a tab is opened
 * without an explicit viewport/zoom/appearance — by the user opening a browser
 * tab, or by an agent calling `preview_open` with no size. Client-local
 * because the Chromium guest they configure is desktop-local.
 */
export const DEFAULT_BROWSER_VIEWPORT: PreviewViewportSetting = FILL_PREVIEW_VIEWPORT;
export const DEFAULT_BROWSER_AUTO_SHOW_FLOATING_PREVIEW = true;

export const ClientSettingsSchema = Schema.Struct({
  agentNotificationsEnabled: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(false))),
  autoOpenPlanSidebar: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(false))),
  browserDefaultViewport: PreviewViewportSetting.pipe(
    Schema.withDecodingDefault(Effect.succeed(DEFAULT_BROWSER_VIEWPORT)),
  ),
  browserDefaultZoomFactor: PreviewZoomFactor.pipe(
    Schema.withDecodingDefault(Effect.succeed(DEFAULT_PREVIEW_ZOOM_FACTOR)),
  ),
  browserDefaultAppearance: PreviewAppearancePreference.pipe(
    Schema.withDecodingDefault(Effect.succeed(DEFAULT_PREVIEW_APPEARANCE)),
  ),
  /**
   * Whether an agent opening a preview pops the floating mini player into
   * view. Only applies when the agent didn't ask either way — an explicit
   * `open`/`show` on `preview_open` still wins, since that is the agent
   * deliberately showing or hiding its work.
   */
  browserAutoShowFloatingPreview: Schema.Boolean.pipe(
    Schema.withDecodingDefault(Effect.succeed(DEFAULT_BROWSER_AUTO_SHOW_FLOATING_PREVIEW)),
  ),
  // `catchDecoding` because these two used to be one setting whose value set
  // included the other's: a settings file written before the split still says
  // `chatBackgroundEffect: "ripple"`. Failing there would take the whole
  // settings file down over one cosmetic preference, so a value this build
  // does not recognise reads as the default instead. The same tolerance covers
  // a file written by a newer build. The bare schemas stay strict, so a client
  // sending a bogus patch is still rejected rather than silently reset.
  chatBackgroundEffect: ChatBackgroundEffect.pipe(
    Schema.catchDecoding(() => Effect.succeed(Option.some(DEFAULT_CHAT_BACKGROUND_EFFECT))),
    Schema.withDecodingDefault(Effect.succeed(DEFAULT_CHAT_BACKGROUND_EFFECT)),
  ),
  chatBorderEffect: ChatBorderEffect.pipe(
    Schema.catchDecoding(() => Effect.succeed(Option.some(DEFAULT_CHAT_BORDER_EFFECT))),
    Schema.withDecodingDefault(Effect.succeed(DEFAULT_CHAT_BORDER_EFFECT)),
  ),
  completionSound: CompletionSound.pipe(
    Schema.withDecodingDefault(Effect.succeed(DEFAULT_COMPLETION_SOUND)),
  ),
  // Desktop-only: require holding the quit shortcut (Cmd/Ctrl+Q) before the
  // app quits; a quick tap only shows a hint. Browser clients ignore it.
  confirmQuit: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(true))),
  confirmThreadArchive: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(false))),
  confirmThreadDelete: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(true))),
  dismissedProviderUpdateNotificationKeys: Schema.Array(TrimmedNonEmptyString).pipe(
    Schema.withDecodingDefault(Effect.succeed([])),
  ),
  diffIgnoreWhitespace: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(true))),
  environmentIdentificationMode: EnvironmentIdentificationMode.pipe(
    Schema.withDecodingDefault(Effect.succeed(DEFAULT_ENVIRONMENT_IDENTIFICATION_MODE)),
  ),
  glassOpacity: GlassOpacity.pipe(
    Schema.withDecodingDefault(Effect.succeed(DEFAULT_GLASS_OPACITY)),
  ),
  uiFontFamily: UiFontFamily.pipe(
    Schema.withDecodingDefault(Effect.succeed(DEFAULT_UI_FONT_FAMILY)),
  ),
  uiFontSize: UiFontSize.pipe(Schema.withDecodingDefault(Effect.succeed(DEFAULT_UI_FONT_SIZE))),
  codeFontFamily: CodeFontFamily.pipe(
    Schema.withDecodingDefault(Effect.succeed(DEFAULT_CODE_FONT_FAMILY)),
  ),
  codeFontSize: CodeFontSize.pipe(
    Schema.withDecodingDefault(Effect.succeed(DEFAULT_CODE_FONT_SIZE)),
  ),
  codeTheme: CodeTheme.pipe(Schema.withDecodingDefault(Effect.succeed(DEFAULT_CODE_THEME))),
  // Model favorites. Historically keyed by provider kind, now
  // widened to `ProviderInstanceId` so users can favorite a specific model
  // on a custom provider instance (e.g. "Codex Personal · gpt-5") without
  // the UI collapsing it into the same bucket as the default Codex. The
  // widening is backward-compatible by construction: prior provider-kind
  // strings satisfy the `ProviderInstanceId` slug schema, so previously
  // persisted favorites decode unchanged and continue to point at the
  // default instance for their kind (because `defaultInstanceIdForDriver(kind)`
  // uses the same slug). The field name is kept as `provider` for storage
  // stability; new call sites should treat the value as an instance id.
  favorites: Schema.Array(
    Schema.Struct({
      provider: ProviderInstanceId,
      model: TrimmedNonEmptyString,
    }),
  ).pipe(Schema.withDecodingDefault(Effect.succeed([]))),
  providerModelPreferences: Schema.Record(
    ProviderInstanceId,
    Schema.Struct({
      hiddenModels: Schema.Array(Schema.String).pipe(
        Schema.withDecodingDefault(Effect.succeed([])),
      ),
      modelOrder: Schema.Array(Schema.String).pipe(Schema.withDecodingDefault(Effect.succeed([]))),
    }),
  ).pipe(Schema.withDecodingDefault(Effect.succeed({}))),
  // Legacy plan mode. The composer's Build/Plan toggle was removed from the
  // default UI; this beta flag restores it (plus the /plan and /default slash
  // commands) for users who still rely on the old workflow.
  planModeEnabled: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(false))),
  // Void keeps its customized project/workspace sidebar as the default. The
  // upstream flat sidebar remains available as an explicit Beta opt-in.
  sidebarV2Enabled: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(false))),
  sidebarAutoSettleAfterDays: Schema.NullOr(SidebarAutoSettleAfterDays).pipe(
    Schema.withDecodingDefault(Effect.succeed(DEFAULT_SIDEBAR_AUTO_SETTLE_AFTER_DAYS)),
  ),
  sidebarAutoSettleOnMerge: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(true))),
  sidebarProjectGroupingMode: SidebarProjectGroupingMode.pipe(
    Schema.withDecodingDefault(Effect.succeed(DEFAULT_SIDEBAR_PROJECT_GROUPING_MODE)),
  ),
  sidebarProjectGroupingOverrides: Schema.Record(
    TrimmedNonEmptyString,
    SidebarProjectGroupingMode,
  ).pipe(Schema.withDecodingDefault(Effect.succeed({}))),
  sidebarProjectSortOrder: SidebarProjectSortOrder.pipe(
    Schema.withDecodingDefault(Effect.succeed(DEFAULT_SIDEBAR_PROJECT_SORT_ORDER)),
  ),
  // Logical project keys the user has hidden from the sidebar. Hiding is a
  // view preference, not a removal: the project keeps its threads and comes
  // back through the "Show hidden repositories" shelf.
  sidebarHiddenProjectKeys: Schema.Array(TrimmedNonEmptyString).pipe(
    Schema.withDecodingDefault(Effect.succeed([])),
  ),
  // Hand-curated project buckets, in the order they appear in the sidebar
  // filter dropdown.
  sidebarProjectGroups: Schema.Array(SidebarProjectGroup).pipe(
    Schema.withDecodingDefault(Effect.succeed([])),
  ),
  // The group currently filtering the project list, or null for "All
  // projects". Falls back to "All projects" when the id no longer resolves.
  sidebarActiveProjectGroupId: Schema.NullOr(TrimmedNonEmptyString).pipe(
    Schema.withDecodingDefault(Effect.succeed(null)),
  ),
  sidebarThreadSortOrder: SidebarThreadSortOrder.pipe(
    Schema.withDecodingDefault(Effect.succeed(DEFAULT_SIDEBAR_THREAD_SORT_ORDER)),
  ),
  sidebarThreadPreviewCount: SidebarThreadPreviewCount.pipe(
    Schema.withDecodingDefault(Effect.succeed(DEFAULT_SIDEBAR_THREAD_PREVIEW_COUNT)),
  ),
  theme: AppThemePreference.pipe(Schema.withDecodingDefault(Effect.succeed(DEFAULT_APP_THEME))),
  timestampFormat: TimestampFormat.pipe(
    Schema.withDecodingDefault(Effect.succeed(DEFAULT_TIMESTAMP_FORMAT)),
  ),
  // Nested rather than four flat keys so the meter's presentation stays one
  // unit here and in `ClientSettingsPatch`. Patched whole, like
  // `providerInstances`: the settings panel always holds the full value.
  usageMeter: UsageMeterSettings,
  // Nested for the same reason as `usageMeter`, and patched whole.
  voiceDictation: VoiceDictationSettings,
  wordWrap: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(true))),
  // Patched whole, like `usageMeter`: the syncing client always holds the
  // complete value it is replacing.
  workspaceSidebar: WorkspaceSidebarSettings,
  workspaceThreadTabs: storedWorkspaceThreadTabs,
});
export type ClientSettings = typeof ClientSettingsSchema.Type;

export const DEFAULT_CLIENT_SETTINGS: ClientSettings = Schema.decodeSync(ClientSettingsSchema)({});

// ── Server Settings (server-authoritative) ────────────────────

// Moved to environment.ts so orchestration contracts can use it without an
// import cycle; re-exported here for compatibility with deep imports.
export { ThreadEnvMode } from "./environment.ts";

const makeBinaryPathSetting = (fallback: string) =>
  TrimmedString.pipe(
    Schema.decodeTo(
      Schema.String,
      SchemaTransformation.transformOrFail({
        decode: (value) => Effect.succeed(value || fallback),
        encode: (value) => Effect.succeed(value),
      }),
    ),
    Schema.withDecodingDefault(Effect.succeed(fallback)),
  );

export type ProviderSettingsFormControl = "text" | "password" | "textarea" | "switch";

export interface ProviderSettingsFormAnnotation {
  readonly control?: ProviderSettingsFormControl | undefined;
  readonly placeholder?: string | undefined;
  readonly hidden?: boolean | undefined;
  readonly clearWhenEmpty?: "omit" | "persist" | undefined;
}

export interface ProviderSettingsFormSchemaAnnotation {
  readonly order?: readonly string[] | undefined;
}

declare module "effect/Schema" {
  namespace Annotations {
    interface Annotations {
      readonly providerSettingsForm?: ProviderSettingsFormAnnotation | undefined;
      readonly providerSettingsFormSchema?: ProviderSettingsFormSchemaAnnotation | undefined;
    }
  }
}

export type ProviderSettingsOrder<Fields extends Schema.Struct.Fields> = readonly Extract<
  keyof Fields,
  string
>[];

export function makeProviderSettingsSchema<const Fields extends Schema.Struct.Fields>(
  fields: Fields,
  options?: {
    readonly order?: ProviderSettingsOrder<Fields> | undefined;
  },
): Schema.Struct<Fields> {
  return Schema.Struct(fields).pipe(
    Schema.annotate({
      providerSettingsFormSchema:
        options?.order === undefined ? undefined : { order: options.order },
    }),
  );
}

export const CodexSettings = makeProviderSettingsSchema(
  {
    enabled: Schema.Boolean.pipe(
      Schema.withDecodingDefault(Effect.succeed(true)),
      Schema.annotateKey({ providerSettingsForm: { hidden: true } }),
    ),
    binaryPath: makeBinaryPathSetting("codex").pipe(
      Schema.annotateKey({
        title: "Binary path",
        description: "Path to the Codex binary used by this instance.",
        providerSettingsForm: { placeholder: "codex", clearWhenEmpty: "omit" },
      }),
    ),
    homePath: TrimmedString.pipe(
      Schema.withDecodingDefault(Effect.succeed("")),
      Schema.annotateKey({
        title: "CODEX_HOME path",
        description: "Custom Codex home and config directory.",
        providerSettingsForm: {
          placeholder: "~/.codex",
          clearWhenEmpty: "omit",
        },
      }),
    ),
    shadowHomePath: TrimmedString.pipe(
      Schema.withDecodingDefault(Effect.succeed("")),
      Schema.annotateKey({
        title: "Shadow home path",
        description:
          "Account-specific Codex home. Keeps auth.json separate while sharing state from CODEX_HOME.",
        providerSettingsForm: {
          placeholder: "~/.codex-t3/personal",
          clearWhenEmpty: "omit",
        },
      }),
    ),
    launchArgs: TrimmedString.pipe(
      Schema.withDecodingDefault(Effect.succeed("")),
      Schema.annotateKey({
        title: "Launch arguments",
        description: "Additional CLI arguments passed to codex app-server on session start.",
      }),
    ),
    customModels: Schema.Array(Schema.String).pipe(
      Schema.withDecodingDefault(Effect.succeed([])),
      Schema.annotateKey({ providerSettingsForm: { hidden: true } }),
    ),
  },
  {
    order: ["binaryPath", "homePath", "shadowHomePath", "launchArgs"],
  },
);
export type CodexSettings = typeof CodexSettings.Type;

export const ClaudeSettings = makeProviderSettingsSchema(
  {
    enabled: Schema.Boolean.pipe(
      Schema.withDecodingDefault(Effect.succeed(true)),
      Schema.annotateKey({ providerSettingsForm: { hidden: true } }),
    ),
    binaryPath: makeBinaryPathSetting("claude").pipe(
      Schema.annotateKey({
        title: "Binary path",
        description: "Path to the Claude binary used by this instance.",
        providerSettingsForm: { placeholder: "claude", clearWhenEmpty: "omit" },
      }),
    ),
    homePath: TrimmedString.pipe(
      Schema.withDecodingDefault(Effect.succeed("")),
      Schema.annotateKey({
        title: "CLAUDE_CONFIG_DIR path",
        description:
          "Custom Claude home and config directory. Keeps .claude.json and .claude separate.",
        providerSettingsForm: { placeholder: "~/.claude", clearWhenEmpty: "omit" },
      }),
    ),
    customModels: Schema.Array(Schema.String).pipe(
      Schema.withDecodingDefault(Effect.succeed([])),
      Schema.annotateKey({ providerSettingsForm: { hidden: true } }),
    ),
    launchArgs: Schema.String.pipe(
      Schema.withDecodingDefault(Effect.succeed("")),
      Schema.annotateKey({
        title: "Launch arguments",
        description: "Additional CLI arguments passed on session start.",
        providerSettingsForm: {
          placeholder: "e.g. --chrome",
          clearWhenEmpty: "omit",
        },
      }),
    ),
  },
  {
    order: ["binaryPath", "homePath", "launchArgs"],
  },
);
export type ClaudeSettings = typeof ClaudeSettings.Type;

export const CursorSettings = makeProviderSettingsSchema(
  {
    // Off by default (like Grok and OpenCode): the binding is not yet
    // stable enough to probe on every install. Users opt in from Settings.
    enabled: Schema.Boolean.pipe(
      Schema.withDecodingDefault(Effect.succeed(false)),
      Schema.annotateKey({ providerSettingsForm: { hidden: true } }),
    ),
    binaryPath: makeBinaryPathSetting("cursor-agent").pipe(
      Schema.annotateKey({
        title: "Binary path",
        description: "Path to the Cursor agent binary.",
        providerSettingsForm: { placeholder: "cursor-agent", clearWhenEmpty: "omit" },
      }),
    ),
    apiEndpoint: TrimmedString.pipe(
      Schema.withDecodingDefault(Effect.succeed("")),
      Schema.annotateKey({
        title: "API endpoint",
        description: "Override the Cursor API endpoint for this instance.",
        providerSettingsForm: {
          placeholder: "https://...",
          clearWhenEmpty: "omit",
        },
      }),
    ),
    customModels: Schema.Array(Schema.String).pipe(
      Schema.withDecodingDefault(Effect.succeed([])),
      Schema.annotateKey({ providerSettingsForm: { hidden: true } }),
    ),
  },
  {
    order: ["binaryPath", "apiEndpoint"],
  },
);
export type CursorSettings = typeof CursorSettings.Type;

export const GrokSettings = makeProviderSettingsSchema(
  {
    // Off by default (like Cursor and OpenCode): the binding is not yet
    // stable enough to probe on every install. Users opt in from Settings.
    enabled: Schema.Boolean.pipe(
      Schema.withDecodingDefault(Effect.succeed(false)),
      Schema.annotateKey({ providerSettingsForm: { hidden: true } }),
    ),
    binaryPath: makeBinaryPathSetting("grok").pipe(
      Schema.annotateKey({
        title: "Binary path",
        description: "Path to the Grok CLI binary.",
        providerSettingsForm: { placeholder: "grok", clearWhenEmpty: "omit" },
      }),
    ),
    customModels: Schema.Array(Schema.String).pipe(
      Schema.withDecodingDefault(Effect.succeed([])),
      Schema.annotateKey({ providerSettingsForm: { hidden: true } }),
    ),
  },
  {
    order: ["binaryPath"],
  },
);
export type GrokSettings = typeof GrokSettings.Type;

export const OpenCodeSettings = makeProviderSettingsSchema(
  {
    // Off by default (like Cursor and Grok): the binding is not yet stable
    // enough to probe on every install. Users opt in from Settings.
    enabled: Schema.Boolean.pipe(
      Schema.withDecodingDefault(Effect.succeed(false)),
      Schema.annotateKey({ providerSettingsForm: { hidden: true } }),
    ),
    binaryPath: makeBinaryPathSetting("opencode").pipe(
      Schema.annotateKey({
        title: "Binary path",
        description: "Path to the OpenCode binary.",
        providerSettingsForm: {
          placeholder: "opencode",
          clearWhenEmpty: "omit",
        },
      }),
    ),
    serverUrl: TrimmedString.pipe(
      Schema.withDecodingDefault(Effect.succeed("")),
      Schema.annotateKey({
        title: "Server URL",
        description: "Leave blank to let T3 Code spawn the server when needed.",
        providerSettingsForm: {
          placeholder: "http://127.0.0.1:4096",
          clearWhenEmpty: "omit",
        },
      }),
    ),
    serverPassword: TrimmedString.pipe(
      Schema.withDecodingDefault(Effect.succeed("")),
      Schema.annotateKey({
        title: "Server password",
        description: "Stored in plain text on disk.",
        providerSettingsForm: {
          control: "password",
          placeholder: "Optional",
          clearWhenEmpty: "omit",
        },
      }),
    ),
    customModels: Schema.Array(Schema.String).pipe(
      Schema.withDecodingDefault(Effect.succeed([])),
      Schema.annotateKey({ providerSettingsForm: { hidden: true } }),
    ),
  },
  {
    order: ["binaryPath", "serverUrl", "serverPassword"],
  },
);
export type OpenCodeSettings = typeof OpenCodeSettings.Type;

export const ObservabilitySettings = Schema.Struct({
  otlpTracesUrl: TrimmedString.pipe(Schema.withDecodingDefault(Effect.succeed(""))),
  otlpMetricsUrl: TrimmedString.pipe(Schema.withDecodingDefault(Effect.succeed(""))),
});
export type ObservabilitySettings = typeof ObservabilitySettings.Type;

export const SourceControlWritingStyleMode = Schema.Literals([
  "repo_conventions",
  "conventional_commits",
  "custom",
]);
export type SourceControlWritingStyleMode = typeof SourceControlWritingStyleMode.Type;

export const SourceControlWritingStyleSettings = Schema.Struct({
  mode: SourceControlWritingStyleMode.pipe(
    Schema.withDecodingDefault(Effect.succeed("repo_conventions" as const)),
  ),
  customInstructions: TrimmedString.pipe(Schema.withDecodingDefault(Effect.succeed(""))),
  followChangeRequestTemplates: Schema.Boolean.pipe(
    Schema.withDecodingDefault(Effect.succeed(true)),
  ),
});
export type SourceControlWritingStyleSettings = typeof SourceControlWritingStyleSettings.Type;

export const DEFAULT_AUTOMATIC_GIT_FETCH_INTERVAL = Duration.seconds(30);
export const DEFAULT_PROVIDER_HEALTH_REFRESH_INTERVAL = Duration.minutes(5);

export const BackgroundActivityProfile = Schema.Literals([
  "balanced",
  "performance",
  "battery-saver",
]);
export type BackgroundActivityProfile = typeof BackgroundActivityProfile.Type;
export const DEFAULT_BACKGROUND_ACTIVITY_PROFILE: BackgroundActivityProfile = "balanced";

export const BackgroundActivityProfileSelection = Schema.Literals([
  "balanced",
  "performance",
  "battery-saver",
  "custom",
]);
export type BackgroundActivityProfileSelection = typeof BackgroundActivityProfileSelection.Type;

export const BackgroundActivityOverrides = Schema.Struct({
  automaticGitFetchInterval: Schema.optionalKey(Schema.DurationFromMillis),
  providerHealthRefreshInterval: Schema.optionalKey(Schema.DurationFromMillis),
  hostPowerMonitorActiveInterval: Schema.optionalKey(Schema.DurationFromMillis),
  hostPowerMonitorIdleInterval: Schema.optionalKey(Schema.DurationFromMillis),
  idleClientTtl: Schema.optionalKey(Schema.DurationFromMillis),
  pauseWhenHostLocked: Schema.optionalKey(Schema.Boolean),
  pauseWhenHostLowPower: Schema.optionalKey(Schema.Boolean),
  pauseWhenClientLowPower: Schema.optionalKey(Schema.Boolean),
  pauseWhenOnBattery: Schema.optionalKey(Schema.Boolean),
});
export type BackgroundActivityOverrides = typeof BackgroundActivityOverrides.Type;

export const BackgroundActivitySettings = Schema.Struct({
  schemaVersion: Schema.Literal(1).pipe(Schema.withDecodingDefault(Effect.succeed(1 as const))),
  profile: BackgroundActivityProfileSelection.pipe(
    Schema.withDecodingDefault(Effect.succeed(DEFAULT_BACKGROUND_ACTIVITY_PROFILE)),
  ),
  baseProfile: Schema.optionalKey(BackgroundActivityProfile),
  overrides: BackgroundActivityOverrides.pipe(Schema.withDecodingDefault(Effect.succeed({}))),
}).pipe(Schema.withDecodingDefault(Effect.succeed({})));
export type BackgroundActivitySettings = typeof BackgroundActivitySettings.Type;

export const ServerSettings = Schema.Struct({
  // Legacy token-by-token assistant output. Deliberately a fresh key (was
  // `enableAssistantStreaming`): decoding drops the old key, so everyone,
  // including prior opt-ins, resets to the buffered default.
  enableLegacyTokenStreaming: Schema.Boolean.pipe(
    Schema.withDecodingDefault(Effect.succeed(false)),
  ),
  enableProviderUpdateChecks: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(true))),
  /**
   * Whether agents may drive the in-app preview browser. Turning this off
   * withholds the MCP credential, so the `t3-code` server (and with it every
   * `preview_*` tool) is never attached to a provider session, and the prompt
   * text describing those tools is dropped along with them. The user's own
   * browser panel is unaffected — this gates agent access only.
   *
   * Server-authoritative rather than client-local: tool injection and prompt
   * construction both happen on the server, and the answer must not differ
   * between a desktop window and a phone attached to the same server.
   */
  enableAgentBrowserAccess: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(true))),
  backgroundActivity: BackgroundActivitySettings,
  // Legacy flat fields retained for old settings files and old clients. New
  // consumers should resolve `backgroundActivity` instead.
  automaticGitFetchInterval: Schema.DurationFromMillis.pipe(
    Schema.withDecodingDefault(
      Effect.succeed(Duration.toMillis(DEFAULT_AUTOMATIC_GIT_FETCH_INTERVAL)),
    ),
  ),
  providerHealthRefreshInterval: Schema.DurationFromMillis.pipe(
    Schema.withDecodingDefault(
      Effect.succeed(Duration.toMillis(DEFAULT_PROVIDER_HEALTH_REFRESH_INTERVAL)),
    ),
  ),
  backgroundActivityProfile: BackgroundActivityProfile.pipe(
    Schema.withDecodingDefault(Effect.succeed(DEFAULT_BACKGROUND_ACTIVITY_PROFILE)),
  ),
  defaultThreadEnvMode: ThreadEnvMode.pipe(
    Schema.withDecodingDefault(Effect.succeed("local" as const satisfies ThreadEnvMode)),
  ),
  newWorktreesStartFromOrigin: Schema.Boolean.pipe(
    Schema.withDecodingDefault(Effect.succeed(true)),
  ),
  addProjectBaseDirectory: TrimmedString.pipe(Schema.withDecodingDefault(Effect.succeed(""))),
  textGenerationModelSelection: ModelSelection.pipe(
    Schema.withDecodingDefault(
      Effect.succeed({
        instanceId: ProviderInstanceId.make("codex"),
        model: DEFAULT_TEXT_GENERATION_MODEL,
        options: [
          {
            id: "reasoningEffort",
            value: DEFAULT_TEXT_GENERATION_REASONING_EFFORT,
          },
        ],
      }),
    ),
  ),
  sourceControlWritingStyle: SourceControlWritingStyleSettings.pipe(
    Schema.withDecodingDefault(Effect.succeed({})),
  ),
  sourceControlWriterModelSelection: Schema.NullOr(ModelSelection).pipe(
    Schema.withDecodingDefault(Effect.succeed(null)),
  ),

  // Legacy single-instance-per-driver settings. Continues to be the source
  // of truth until `providerInstances` (below) lands per-driver migration
  // shims and the server starts hydrating instances from it. Driver-specific
  // schemas live here for the duration of the migration; once each driver
  // owns its config in its own package, this struct shrinks to nothing and
  // is removed entirely.
  providers: Schema.Struct({
    codex: CodexSettings.pipe(Schema.withDecodingDefault(Effect.succeed({}))),
    claudeAgent: ClaudeSettings.pipe(Schema.withDecodingDefault(Effect.succeed({}))),
    cursor: CursorSettings.pipe(Schema.withDecodingDefault(Effect.succeed({}))),
    grok: GrokSettings.pipe(Schema.withDecodingDefault(Effect.succeed({}))),
    opencode: OpenCodeSettings.pipe(Schema.withDecodingDefault(Effect.succeed({}))),
  }).pipe(Schema.withDecodingDefault(Effect.succeed({}))),
  // New driver-agnostic instance map. Keyed by `ProviderInstanceId`; values
  // are `ProviderInstanceConfig` envelopes. The driver-specific config blob
  // is `Schema.Unknown` at this layer so envelopes with unknown drivers
  // (forks, downgrades, in-flight PR branches) round-trip without loss.
  // See providerInstance.ts for the forward/backward compatibility invariant.
  providerInstances: Schema.Record(ProviderInstanceId, ProviderInstanceConfig).pipe(
    Schema.withDecodingDefault(Effect.succeed({})),
  ),
  observability: ObservabilitySettings.pipe(Schema.withDecodingDefault(Effect.succeed({}))),
  // UI preferences that used to live only in the browser's localStorage, and
  // therefore reset on every new origin (localhost vs a tailnet hostname) and
  // every new device. Stored here so they follow the server instead of the
  // browser. Kept as one nested blob rather than 30 flat fields so the
  // client/server schema split stays intact and `ClientSettingsSchema` remains
  // the single definition of the field set.
  clientSettings: ClientSettingsSchema.pipe(Schema.withDecodingDefault(Effect.succeed({}))),
  // Actions that apply to every project on this server, as opposed to the
  // per-project lists on the project row. They live here rather than in the
  // projection because "global" means "this server", which is exactly the
  // scope settings.json already has — and because ServerConfig ships the whole
  // settings blob, every client sees them without a new fetch.
  globalScripts: Schema.Array(ProjectScript).pipe(Schema.withDecodingDefault(Effect.succeed([]))),
  globalPromptActions: Schema.Array(ProjectPromptAction).pipe(
    Schema.withDecodingDefault(Effect.succeed([])),
  ),
});
export type ServerSettings = typeof ServerSettings.Type;

export const DEFAULT_SERVER_SETTINGS: ServerSettings = Schema.decodeSync(ServerSettings)({});

/**
 * Read the legacy `enabled` flag embedded in a provider instance config
 * blob. The envelope-level `ProviderInstanceConfig.enabled` is the single
 * flag going forward; this reader exists for legacy `providers.<kind>`
 * blobs and old settings files that still carry the flag in-config.
 */
export const providerInstanceConfigEnabledFlag = (config: unknown): boolean | undefined => {
  if (config === null || typeof config !== "object" || Array.isArray(config)) {
    return undefined;
  }
  const enabled = (config as { readonly enabled?: unknown }).enabled;
  return typeof enabled === "boolean" ? enabled : undefined;
};

/**
 * Default enabled state for a built-in driver when neither the envelope nor
 * the config blob carries a flag. Derived from the driver's settings schema
 * through `DEFAULT_SERVER_SETTINGS`, so the schema's decoding default stays
 * the single source of truth. Unknown (fork) drivers default to enabled.
 */
export const defaultEnabledForDriver = (driver: ProviderDriverKind): boolean => {
  const legacyDefaults = DEFAULT_SERVER_SETTINGS.providers as Record<
    string,
    { readonly enabled?: boolean } | undefined
  >;
  return legacyDefaults[driver]?.enabled ?? true;
};

/**
 * Resolve whether a configured provider instance is enabled. An explicit
 * false on either the envelope or the in-config flag wins (most
 * restrictive), so a user's disable is never silently undone by the other
 * flag. Otherwise: envelope, then config, then the driver's default.
 */
export const resolveProviderInstanceEnabled = (
  instance: Pick<ProviderInstanceConfig, "driver" | "enabled" | "config">,
): boolean => {
  const configEnabled = providerInstanceConfigEnabledFlag(instance.config);
  if (instance.enabled === false || configEnabled === false) {
    return false;
  }
  return instance.enabled ?? configEnabled ?? defaultEnabledForDriver(instance.driver);
};

export const ServerSettingsOperation = Schema.Literals([
  "normalize",
  "check-exists",
  "read-file",
  "read-provider-history",
  "read-secret",
  "remove-secret",
  "remove-stale-secret",
  "write-secret",
  "write-file",
  "prepare-directory",
]);
export type ServerSettingsOperation = typeof ServerSettingsOperation.Type;

export class ServerSettingsError extends Schema.TaggedErrorClass<ServerSettingsError>()(
  "ServerSettingsError",
  {
    settingsPath: Schema.String,
    operation: ServerSettingsOperation,
    providerInstanceId: Schema.optional(Schema.String),
    environmentVariable: Schema.optional(Schema.String),
    cause: Schema.Defect(),
  },
) {
  override get message(): string {
    const provider =
      this.providerInstanceId === undefined ? "" : ` for provider ${this.providerInstanceId}`;
    const variable =
      this.environmentVariable === undefined
        ? ""
        : ` and environment variable ${this.environmentVariable}`;
    return `Server settings ${this.operation} failed${provider}${variable} at ${this.settingsPath}.`;
  }
}

// ── Unified type ─────────────────────────────────────────────────────

export type UnifiedSettings = ServerSettings & ClientSettings;
export const DEFAULT_UNIFIED_SETTINGS: UnifiedSettings = {
  ...DEFAULT_SERVER_SETTINGS,
  ...DEFAULT_CLIENT_SETTINGS,
};

// ── Server Settings Patch (replace with a Schema.deepPartial if available) ──────────────────────────────────────────

const ModelSelectionPatch = Schema.Struct({
  instanceId: Schema.optionalKey(ProviderInstanceId),
  model: Schema.optionalKey(TrimmedNonEmptyString),
  options: Schema.optionalKey(ProviderOptionSelections),
});

const CodexSettingsPatch = Schema.Struct({
  enabled: Schema.optionalKey(Schema.Boolean),
  binaryPath: Schema.optionalKey(TrimmedString),
  homePath: Schema.optionalKey(TrimmedString),
  shadowHomePath: Schema.optionalKey(TrimmedString),
  launchArgs: Schema.optionalKey(TrimmedString),
  customModels: Schema.optionalKey(Schema.Array(Schema.String)),
});

const ClaudeSettingsPatch = Schema.Struct({
  enabled: Schema.optionalKey(Schema.Boolean),
  binaryPath: Schema.optionalKey(TrimmedString),
  homePath: Schema.optionalKey(TrimmedString),
  customModels: Schema.optionalKey(Schema.Array(Schema.String)),
  launchArgs: Schema.optionalKey(TrimmedString),
});

const CursorSettingsPatch = Schema.Struct({
  enabled: Schema.optionalKey(Schema.Boolean),
  binaryPath: Schema.optionalKey(TrimmedString),
  apiEndpoint: Schema.optionalKey(TrimmedString),
  customModels: Schema.optionalKey(Schema.Array(Schema.String)),
});

const GrokSettingsPatch = Schema.Struct({
  enabled: Schema.optionalKey(Schema.Boolean),
  binaryPath: Schema.optionalKey(TrimmedString),
  customModels: Schema.optionalKey(Schema.Array(Schema.String)),
});

const OpenCodeSettingsPatch = Schema.Struct({
  enabled: Schema.optionalKey(Schema.Boolean),
  binaryPath: Schema.optionalKey(TrimmedString),
  serverUrl: Schema.optionalKey(TrimmedString),
  serverPassword: Schema.optionalKey(TrimmedString),
  customModels: Schema.optionalKey(Schema.Array(Schema.String)),
});

export const ServerSettingsPatch = Schema.Struct({
  // Server settings
  enableLegacyTokenStreaming: Schema.optionalKey(Schema.Boolean),
  enableProviderUpdateChecks: Schema.optionalKey(Schema.Boolean),
  enableAgentBrowserAccess: Schema.optionalKey(Schema.Boolean),
  backgroundActivity: Schema.optionalKey(
    Schema.Struct({
      schemaVersion: Schema.optionalKey(Schema.Literal(1)),
      profile: Schema.optionalKey(BackgroundActivityProfileSelection),
      baseProfile: Schema.optionalKey(BackgroundActivityProfile),
      overrides: Schema.optionalKey(BackgroundActivityOverrides),
    }),
  ),
  automaticGitFetchInterval: Schema.optionalKey(Schema.DurationFromMillis),
  providerHealthRefreshInterval: Schema.optionalKey(Schema.DurationFromMillis),
  backgroundActivityProfile: Schema.optionalKey(BackgroundActivityProfile),
  defaultThreadEnvMode: Schema.optionalKey(ThreadEnvMode),
  newWorktreesStartFromOrigin: Schema.optionalKey(Schema.Boolean),
  addProjectBaseDirectory: Schema.optionalKey(TrimmedString),
  textGenerationModelSelection: Schema.optionalKey(ModelSelectionPatch),
  sourceControlWritingStyle: Schema.optionalKey(
    Schema.Struct({
      mode: Schema.optionalKey(SourceControlWritingStyleMode),
      customInstructions: Schema.optionalKey(TrimmedString),
      followChangeRequestTemplates: Schema.optionalKey(Schema.Boolean),
    }),
  ),
  sourceControlWriterModelSelection: Schema.optionalKey(Schema.NullOr(ModelSelection)),
  observability: Schema.optionalKey(
    Schema.Struct({
      otlpTracesUrl: Schema.optionalKey(TrimmedString),
      otlpMetricsUrl: Schema.optionalKey(TrimmedString),
    }),
  ),
  providers: Schema.optionalKey(
    Schema.Struct({
      codex: Schema.optionalKey(CodexSettingsPatch),
      claudeAgent: Schema.optionalKey(ClaudeSettingsPatch),
      cursor: Schema.optionalKey(CursorSettingsPatch),
      grok: Schema.optionalKey(GrokSettingsPatch),
      opencode: Schema.optionalKey(OpenCodeSettingsPatch),
    }),
  ),
  // Whole-map replacement for the new instance config. Patching individual
  // entries is intentionally out of scope: the map is small, and partial
  // patches risk leaving driver-specific config in a half-merged state.
  // The web UI sends a fully-formed map every time it edits this field.
  providerInstances: Schema.optionalKey(Schema.Record(ProviderInstanceId, ProviderInstanceConfig)),
  // Whole-blob replacement, for the same reason as `providerInstances`: the
  // web UI always holds a fully-formed `ClientSettings` and sends all of it,
  // so a partial merge here would only add a way to half-write the blob.
  clientSettings: Schema.optionalKey(ClientSettingsSchema),
  // Whole-array replacement, same reason again. The editing client holds the
  // full list and sends all of it; a deep merge would splice entries together
  // element-wise and corrupt the list on any removal.
  globalScripts: Schema.optionalKey(Schema.Array(ProjectScript)),
  globalPromptActions: Schema.optionalKey(Schema.Array(ProjectPromptAction)),
});
export type ServerSettingsPatch = typeof ServerSettingsPatch.Type;

export const ClientSettingsPatch = Schema.Struct({
  agentNotificationsEnabled: Schema.optionalKey(Schema.Boolean),
  autoOpenPlanSidebar: Schema.optionalKey(Schema.Boolean),
  browserDefaultViewport: Schema.optionalKey(PreviewViewportSetting),
  browserDefaultZoomFactor: Schema.optionalKey(PreviewZoomFactor),
  browserDefaultAppearance: Schema.optionalKey(PreviewAppearancePreference),
  browserAutoShowFloatingPreview: Schema.optionalKey(Schema.Boolean),
  completionSound: Schema.optionalKey(CompletionSound),
  confirmQuit: Schema.optionalKey(Schema.Boolean),
  confirmThreadArchive: Schema.optionalKey(Schema.Boolean),
  confirmThreadDelete: Schema.optionalKey(Schema.Boolean),
  diffIgnoreWhitespace: Schema.optionalKey(Schema.Boolean),
  environmentIdentificationMode: Schema.optionalKey(EnvironmentIdentificationMode),
  glassOpacity: Schema.optionalKey(GlassOpacity),
  uiFontFamily: Schema.optionalKey(UiFontFamily),
  uiFontSize: Schema.optionalKey(UiFontSize),
  chatBackgroundEffect: Schema.optionalKey(ChatBackgroundEffect),
  chatBorderEffect: Schema.optionalKey(ChatBorderEffect),
  codeFontFamily: Schema.optionalKey(CodeFontFamily),
  codeFontSize: Schema.optionalKey(CodeFontSize),
  codeTheme: Schema.optionalKey(CodeTheme),
  favorites: Schema.optionalKey(
    Schema.Array(
      Schema.Struct({
        provider: ProviderInstanceId,
        model: TrimmedNonEmptyString,
      }),
    ),
  ),
  providerModelPreferences: Schema.optionalKey(
    Schema.Record(
      ProviderInstanceId,
      Schema.Struct({
        hiddenModels: Schema.Array(Schema.String).pipe(
          Schema.withDecodingDefault(Effect.succeed([])),
        ),
        modelOrder: Schema.Array(Schema.String).pipe(
          Schema.withDecodingDefault(Effect.succeed([])),
        ),
      }),
    ),
  ),
  planModeEnabled: Schema.optionalKey(Schema.Boolean),
  sidebarV2Enabled: Schema.optionalKey(Schema.Boolean),
  sidebarAutoSettleAfterDays: Schema.optionalKey(Schema.NullOr(SidebarAutoSettleAfterDays)),
  sidebarAutoSettleOnMerge: Schema.optionalKey(Schema.Boolean),
  sidebarProjectGroupingMode: Schema.optionalKey(SidebarProjectGroupingMode),
  sidebarProjectGroupingOverrides: Schema.optionalKey(
    Schema.Record(TrimmedNonEmptyString, SidebarProjectGroupingMode),
  ),
  sidebarProjectSortOrder: Schema.optionalKey(SidebarProjectSortOrder),
  sidebarHiddenProjectKeys: Schema.optionalKey(Schema.Array(TrimmedNonEmptyString)),
  // Whole-blob replacement: the sidebar always holds the complete group list
  // it is replacing.
  sidebarProjectGroups: Schema.optionalKey(Schema.Array(SidebarProjectGroup)),
  sidebarActiveProjectGroupId: Schema.optionalKey(Schema.NullOr(TrimmedNonEmptyString)),
  sidebarThreadSortOrder: Schema.optionalKey(SidebarThreadSortOrder),
  sidebarThreadPreviewCount: Schema.optionalKey(SidebarThreadPreviewCount),
  theme: Schema.optionalKey(AppThemePreference),
  timestampFormat: Schema.optionalKey(TimestampFormat),
  // Whole-blob replacement — every field carries a decoding default, so a
  // partial object here silently resets the fields it omits. Send all of it.
  usageMeter: Schema.optionalKey(UsageMeterSettings),
  // Whole-blob replacement, same as `usageMeter`.
  voiceDictation: Schema.optionalKey(VoiceDictationSettings),
  wordWrap: Schema.optionalKey(Schema.Boolean),
  // Whole-blob replacements too: the syncing client sends the complete open
  // set / label set it wants the other devices to converge on.
  workspaceSidebar: Schema.optionalKey(WorkspaceSidebarSettings),
  workspaceThreadTabs: Schema.optionalKey(WorkspaceThreadTabsSettings),
});
export type ClientSettingsPatch = typeof ClientSettingsPatch.Type;
