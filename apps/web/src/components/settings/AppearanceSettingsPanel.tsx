import type { CSSProperties } from "react";
import { useState } from "react";
import {
  DEFAULT_ENVIRONMENT_IDENTIFICATION_MODE,
  DEFAULT_UNIFIED_SETTINGS,
  type ChatWidth,
  type EnvironmentIdentificationMode,
  MAX_APPEARANCE_CONTRAST,
  MAX_CODE_FONT_SIZE,
  MAX_GLASS_OPACITY,
  MAX_PANEL_ANIMATION_DURATION_MS,
  MAX_UI_FONT_SIZE,
  MIN_APPEARANCE_CONTRAST,
  MIN_CODE_FONT_SIZE,
  MIN_GLASS_OPACITY,
  MIN_PANEL_ANIMATION_DURATION_MS,
  MIN_UI_FONT_SIZE,
} from "@t3tools/contracts/settings";
import {
  CODE_FONT_OPTIONS,
  CODE_THEME_OPTIONS,
  UI_FONT_OPTIONS,
} from "../../appearancePreferences";
import { MAX_UI_ZOOM, MIN_UI_ZOOM, isUiZoomActive, useUiZoom } from "../../uiZoomPreference";
import {
  resolveEnvironmentIdentificationPillLabel,
  useEnvironmentStageLabel,
} from "../SidebarStageBackdrop";
import { useCustomThemes } from "../../hooks/useCustomThemes";
import { useTheme } from "../../hooks/useTheme";
import { useScopedSettings, useUpdateScopedSettings } from "./useScopedSettings";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Switch } from "../ui/switch";
import {
  NumberField,
  NumberFieldDecrement,
  NumberFieldGroup,
  NumberFieldIncrement,
  NumberFieldInput,
} from "../ui/number-field";
import {
  CHAT_BACKGROUND_EFFECT_LABELS,
  CHAT_BACKGROUND_EFFECT_OPTIONS,
  CHAT_BORDER_EFFECT_LABELS,
  CHAT_BORDER_EFFECT_OPTIONS,
} from "../chat/backgroundEffects";
import { FontFamilyPicker } from "./FontFamilyPicker";
import { ThemeLibrary } from "./ThemeSettings";
import {
  SettingResetButton,
  SettingsPageContainer,
  SettingsRow,
  SettingsSection,
} from "./settingsLayout";
import { searchableSetting } from "./settingsSearch";
import { PanelAnimationsPreview } from "./PanelAnimationsPreview";
import { UsageMeterSettingsSection } from "./UsageMeterSettingsSection";

const ENVIRONMENT_IDENTIFICATION_LABELS: Record<EnvironmentIdentificationMode, string> = {
  artwork: "Artwork",
  pill: "Version pill",
  none: "None",
};

const CHAT_WIDTH_LABELS: Record<ChatWidth, string> = {
  comfortable: "Comfortable",
  wide: "Wide",
  full: "Full",
};

function includesOptionValue<Value extends string>(
  options: ReadonlyArray<{ value: Value }>,
  value: unknown,
): value is Value {
  return typeof value === "string" && options.some((option) => option.value === value);
}

function FontSizeControl({
  value,
  min,
  max,
  label,
  onChange,
}: {
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly label: string;
  readonly onChange: (value: number) => void;
}) {
  return (
    <div className="flex w-full items-center gap-2 sm:w-auto">
      <NumberField
        className="w-32"
        max={max}
        min={min}
        onValueChange={(nextValue) => {
          if (
            typeof nextValue === "number" &&
            Number.isInteger(nextValue) &&
            nextValue >= min &&
            nextValue <= max
          ) {
            onChange(nextValue);
          }
        }}
        size="sm"
        step={1}
        value={value}
      >
        <NumberFieldGroup>
          <NumberFieldDecrement aria-label={`Decrease ${label}`} />
          <NumberFieldInput aria-label={`${label} in pixels`} />
          <NumberFieldIncrement aria-label={`Increase ${label}`} />
        </NumberFieldGroup>
      </NumberField>
      <span className="text-xs text-muted-foreground">px</span>
    </div>
  );
}

export function AppearanceSettingsPanel() {
  const {
    appearanceMode,
    refreshTheme,
    resolvedTheme,
    setAppearanceMode,
    setTheme,
    setThemeHalf,
    theme,
    themeHalves,
  } = useTheme();
  const customThemes = useCustomThemes();
  const [isImportThemeOpen, setIsImportThemeOpen] = useState(false);
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();
  const { zoom: uiZoom, setZoom: setUiZoom, resetZoom: resetUiZoom } = useUiZoom();
  const environmentStageLabel = useEnvironmentStageLabel();
  const showEnvironmentIdentification =
    resolveEnvironmentIdentificationPillLabel(environmentStageLabel) !== null;
  const uiZoomRatio = (uiZoom - MIN_UI_ZOOM) / (MAX_UI_ZOOM - MIN_UI_ZOOM);
  const uiZoomSliderStyle = {
    "--settings-slider-progress": `${uiZoomRatio * 100}%`,
    "--settings-slider-fill-offset": `${0.5 - uiZoomRatio}rem`,
  } as CSSProperties;
  const glassOpacityRatio =
    (settings.glassOpacity - MIN_GLASS_OPACITY) / (MAX_GLASS_OPACITY - MIN_GLASS_OPACITY);
  const glassOpacitySliderStyle = {
    "--settings-slider-progress": `${glassOpacityRatio * 100}%`,
    "--settings-slider-fill-offset": `${0.5 - glassOpacityRatio}rem`,
  } as CSSProperties;
  const appearanceContrastRatio =
    (settings.appearanceContrast - MIN_APPEARANCE_CONTRAST) /
    (MAX_APPEARANCE_CONTRAST - MIN_APPEARANCE_CONTRAST);
  const appearanceContrastSliderStyle = {
    "--settings-slider-progress": `${appearanceContrastRatio * 100}%`,
    "--settings-slider-fill-offset": `${0.5 - appearanceContrastRatio}rem`,
  } as CSSProperties;
  const panelAnimationDurationRatio =
    (settings.panelAnimationDurationMs - MIN_PANEL_ANIMATION_DURATION_MS) /
    (MAX_PANEL_ANIMATION_DURATION_MS - MIN_PANEL_ANIMATION_DURATION_MS);
  const panelAnimationDurationSliderStyle = {
    "--settings-slider-progress": `${panelAnimationDurationRatio * 100}%`,
    "--settings-slider-fill-offset": `${0.5 - panelAnimationDurationRatio}rem`,
  } as CSSProperties;

  return (
    <SettingsPageContainer>
      <SettingsSection id="appearance" title="Colors & themes" variant="plain" hideTitle>
        <div id={searchableSetting("theme").id}>
          <ThemeLibrary
            appearanceMode={appearanceMode}
            customThemes={customThemes}
            initialAppearance={resolvedTheme}
            refreshTheme={refreshTheme}
            isImportOpen={isImportThemeOpen}
            setAppearanceMode={setAppearanceMode}
            setTheme={setTheme}
            setThemeHalf={setThemeHalf}
            theme={theme}
            themeHalves={themeHalves}
            onImportOpenChange={setIsImportThemeOpen}
          />
        </div>
      </SettingsSection>

      <SettingsSection id="appearance-interface" title="Interface">
        <SettingsRow
          {...searchableSetting("setting-appearance-contrast")}
          description="Adjust the contrast of colors and borders across the interface."
          resetAction={
            settings.appearanceContrast !== DEFAULT_UNIFIED_SETTINGS.appearanceContrast ? (
              <SettingResetButton
                label="contrast"
                onClick={() =>
                  updateSettings({
                    appearanceContrast: DEFAULT_UNIFIED_SETTINGS.appearanceContrast,
                  })
                }
              />
            ) : null
          }
          control={
            <div className="flex w-full items-center gap-3 sm:w-52">
              <output
                className="min-w-12 rounded-md bg-muted px-2 py-1 text-center font-mono text-xs font-medium tabular-nums text-foreground"
                htmlFor="appearance-contrast"
              >
                {settings.appearanceContrast}%
              </output>
              <input
                aria-label="Contrast"
                className="settings-slider min-w-0 flex-1"
                id="appearance-contrast"
                max={MAX_APPEARANCE_CONTRAST}
                min={MIN_APPEARANCE_CONTRAST}
                onChange={(event) => {
                  const appearanceContrast = Number(event.currentTarget.value);
                  if (
                    Number.isInteger(appearanceContrast) &&
                    appearanceContrast >= MIN_APPEARANCE_CONTRAST &&
                    appearanceContrast <= MAX_APPEARANCE_CONTRAST
                  ) {
                    updateSettings({ appearanceContrast });
                  }
                }}
                step={5}
                style={appearanceContrastSliderStyle}
                type="range"
                value={settings.appearanceContrast}
              />
            </div>
          }
        />

        <SettingsRow
          {...searchableSetting("ui-font-family")}
          description="Font used throughout the interface."
          resetAction={
            settings.uiFontFamily !== DEFAULT_UNIFIED_SETTINGS.uiFontFamily ? (
              <SettingResetButton
                label="UI font family"
                onClick={() =>
                  updateSettings({ uiFontFamily: DEFAULT_UNIFIED_SETTINGS.uiFontFamily })
                }
              />
            ) : null
          }
          control={
            <FontFamilyPicker
              label="UI font family"
              presets={UI_FONT_OPTIONS}
              value={settings.uiFontFamily}
              onValueChange={(uiFontFamily) => updateSettings({ uiFontFamily })}
            />
          }
        />

        <SettingsRow
          {...searchableSetting("ui-font-size")}
          description="Base size for interface text."
          resetAction={
            settings.uiFontSize !== DEFAULT_UNIFIED_SETTINGS.uiFontSize ? (
              <SettingResetButton
                label="UI font size"
                onClick={() => updateSettings({ uiFontSize: DEFAULT_UNIFIED_SETTINGS.uiFontSize })}
              />
            ) : null
          }
          control={
            <FontSizeControl
              label="UI font size"
              max={MAX_UI_FONT_SIZE}
              min={MIN_UI_FONT_SIZE}
              onChange={(uiFontSize) => updateSettings({ uiFontSize })}
              value={settings.uiFontSize}
            />
          }
        />

        <SettingsRow
          {...searchableSetting("setting-ui-zoom")}
          description="Scales the whole interface, not only text. Lower values fit more on screen."
          resetAction={
            isUiZoomActive(uiZoom) ? (
              <SettingResetButton label="interface zoom" onClick={resetUiZoom} />
            ) : null
          }
          control={
            <div className="flex w-full items-center gap-3 sm:w-52">
              <output
                className="min-w-12 rounded-md bg-muted px-2 py-1 text-center font-mono text-xs font-medium tabular-nums text-foreground"
                htmlFor="ui-zoom"
              >
                {uiZoom}%
              </output>
              <input
                aria-label="Interface zoom"
                className="settings-slider min-w-0 flex-1"
                id="ui-zoom"
                max={MAX_UI_ZOOM}
                min={MIN_UI_ZOOM}
                onChange={(event) => setUiZoom(Number(event.currentTarget.value))}
                step={5}
                style={uiZoomSliderStyle}
                type="range"
                value={uiZoom}
              />
            </div>
          }
        />

        <SettingsRow
          {...searchableSetting("code-theme")}
          description="Syntax highlighting colors for code blocks, files, and diffs."
          resetAction={
            settings.codeTheme !== DEFAULT_UNIFIED_SETTINGS.codeTheme ? (
              <SettingResetButton
                label="code theme"
                onClick={() => updateSettings({ codeTheme: DEFAULT_UNIFIED_SETTINGS.codeTheme })}
              />
            ) : null
          }
          control={
            <Select
              value={settings.codeTheme}
              onValueChange={(value) => {
                if (includesOptionValue(CODE_THEME_OPTIONS, value)) {
                  updateSettings({ codeTheme: value });
                }
              }}
            >
              <SelectTrigger className="w-full sm:w-56" aria-label="Code theme">
                <SelectValue>
                  {CODE_THEME_OPTIONS.find((option) => option.value === settings.codeTheme)?.label}
                </SelectValue>
              </SelectTrigger>
              <SelectPopup align="end" alignItemWithTrigger={false}>
                {CODE_THEME_OPTIONS.map((option) => (
                  <SelectItem hideIndicator key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          }
        />

        <SettingsRow
          {...searchableSetting("code-font-family")}
          description="Font used for code blocks, files, and diffs."
          resetAction={
            settings.codeFontFamily !== DEFAULT_UNIFIED_SETTINGS.codeFontFamily ? (
              <SettingResetButton
                label="code font family"
                onClick={() =>
                  updateSettings({ codeFontFamily: DEFAULT_UNIFIED_SETTINGS.codeFontFamily })
                }
              />
            ) : null
          }
          control={
            <FontFamilyPicker
              label="Code font family"
              presets={CODE_FONT_OPTIONS}
              value={settings.codeFontFamily}
              onValueChange={(codeFontFamily) => updateSettings({ codeFontFamily })}
            />
          }
        />

        <SettingsRow
          {...searchableSetting("code-font-size")}
          description="Text size for code blocks, files, and diffs."
          resetAction={
            settings.codeFontSize !== DEFAULT_UNIFIED_SETTINGS.codeFontSize ? (
              <SettingResetButton
                label="code font size"
                onClick={() =>
                  updateSettings({ codeFontSize: DEFAULT_UNIFIED_SETTINGS.codeFontSize })
                }
              />
            ) : null
          }
          control={
            <FontSizeControl
              label="code font size"
              max={MAX_CODE_FONT_SIZE}
              min={MIN_CODE_FONT_SIZE}
              onChange={(codeFontSize) => updateSettings({ codeFontSize })}
              value={settings.codeFontSize}
            />
          }
        />

        <SettingsRow
          {...searchableSetting("setting-glass-opacity")}
          description="Higher values make menus, dialogs, and the composer more solid."
          resetAction={
            settings.glassOpacity !== DEFAULT_UNIFIED_SETTINGS.glassOpacity ? (
              <SettingResetButton
                label="glass opacity"
                onClick={() =>
                  updateSettings({ glassOpacity: DEFAULT_UNIFIED_SETTINGS.glassOpacity })
                }
              />
            ) : null
          }
          control={
            <div className="flex w-full items-center gap-3 sm:w-52">
              <output
                className="min-w-12 rounded-md bg-muted px-2 py-1 text-center font-mono text-xs font-medium tabular-nums text-foreground"
                htmlFor="glass-opacity"
              >
                {settings.glassOpacity}%
              </output>
              <input
                aria-label="Glass opacity"
                className="settings-slider min-w-0 flex-1"
                id="glass-opacity"
                max={MAX_GLASS_OPACITY}
                min={MIN_GLASS_OPACITY}
                onChange={(event) => {
                  const glassOpacity = Number(event.currentTarget.value);
                  if (
                    Number.isInteger(glassOpacity) &&
                    glassOpacity >= MIN_GLASS_OPACITY &&
                    glassOpacity <= MAX_GLASS_OPACITY
                  ) {
                    updateSettings({ glassOpacity });
                  }
                }}
                step={5}
                style={glassOpacitySliderStyle}
                type="range"
                value={settings.glassOpacity}
              />
            </div>
          }
        />

        <SettingsRow
          {...searchableSetting("chat-background-effect")}
          description="Ambient animation filling the chat area behind the new thread screen. It stops as soon as the conversation starts, and stays off when your system asks for reduced motion."
          resetAction={
            settings.chatBackgroundEffect !== DEFAULT_UNIFIED_SETTINGS.chatBackgroundEffect ? (
              <SettingResetButton
                label="chat background effect"
                onClick={() =>
                  updateSettings({
                    chatBackgroundEffect: DEFAULT_UNIFIED_SETTINGS.chatBackgroundEffect,
                  })
                }
              />
            ) : null
          }
          control={
            <Select
              value={settings.chatBackgroundEffect}
              onValueChange={(value) => {
                if (includesOptionValue(CHAT_BACKGROUND_EFFECT_OPTIONS, value)) {
                  updateSettings({ chatBackgroundEffect: value });
                }
              }}
            >
              <SelectTrigger className="w-full sm:w-40" aria-label="Chat background effect">
                <SelectValue>
                  {CHAT_BACKGROUND_EFFECT_LABELS[settings.chatBackgroundEffect]}
                </SelectValue>
              </SelectTrigger>
              <SelectPopup align="end" alignItemWithTrigger={false}>
                {CHAT_BACKGROUND_EFFECT_OPTIONS.map((option) => (
                  <SelectItem hideIndicator key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          }
        />

        <SettingsRow
          {...searchableSetting("chat-border-effect")}
          description="Ambient animation tracing the message box on the new thread screen. Independent of the background effect, and follows the same reduced motion rule."
          resetAction={
            settings.chatBorderEffect !== DEFAULT_UNIFIED_SETTINGS.chatBorderEffect ? (
              <SettingResetButton
                label="chat border effect"
                onClick={() =>
                  updateSettings({
                    chatBorderEffect: DEFAULT_UNIFIED_SETTINGS.chatBorderEffect,
                  })
                }
              />
            ) : null
          }
          control={
            <Select
              value={settings.chatBorderEffect}
              onValueChange={(value) => {
                if (includesOptionValue(CHAT_BORDER_EFFECT_OPTIONS, value)) {
                  updateSettings({ chatBorderEffect: value });
                }
              }}
            >
              <SelectTrigger className="w-full sm:w-40" aria-label="Chat border effect">
                <SelectValue>{CHAT_BORDER_EFFECT_LABELS[settings.chatBorderEffect]}</SelectValue>
              </SelectTrigger>
              <SelectPopup align="end" alignItemWithTrigger={false}>
                {CHAT_BORDER_EFFECT_OPTIONS.map((option) => (
                  <SelectItem hideIndicator key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          }
        />

        {showEnvironmentIdentification ? (
          <SettingsRow
            {...searchableSetting("environment-identification")}
            description="Choose how Dev and Nightly environments are identified."
            resetAction={
              settings.environmentIdentificationMode !== DEFAULT_ENVIRONMENT_IDENTIFICATION_MODE ? (
                <SettingResetButton
                  label="environment identification"
                  onClick={() =>
                    updateSettings({
                      environmentIdentificationMode: DEFAULT_ENVIRONMENT_IDENTIFICATION_MODE,
                    })
                  }
                />
              ) : null
            }
            control={
              <Select
                value={settings.environmentIdentificationMode}
                onValueChange={(value) => {
                  if (value === "artwork" || value === "pill" || value === "none") {
                    updateSettings({ environmentIdentificationMode: value });
                  }
                }}
              >
                <SelectTrigger
                  size="sm"
                  className="w-full sm:w-40"
                  aria-label="Environment identification"
                >
                  <SelectValue>
                    {ENVIRONMENT_IDENTIFICATION_LABELS[settings.environmentIdentificationMode]}
                  </SelectValue>
                </SelectTrigger>
                <SelectPopup align="end" alignItemWithTrigger={false}>
                  {Object.entries(ENVIRONMENT_IDENTIFICATION_LABELS).map(([value, label]) => (
                    <SelectItem hideIndicator key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
            }
          />
        ) : null}

        <SettingsRow
          {...searchableSetting("word-wrap")}
          description="Wrap long lines in code blocks, tables, diffs, and file previews by default."
          resetAction={
            settings.wordWrap !== DEFAULT_UNIFIED_SETTINGS.wordWrap ? (
              <SettingResetButton
                label="word wrapping"
                onClick={() =>
                  updateSettings({
                    wordWrap: DEFAULT_UNIFIED_SETTINGS.wordWrap,
                  })
                }
              />
            ) : null
          }
          control={
            <Switch
              checked={settings.wordWrap}
              onCheckedChange={(checked) => updateSettings({ wordWrap: Boolean(checked) })}
              aria-label="Wrap code, tables, diffs, and file previews by default"
            />
          }
        />

        <SettingsRow
          {...searchableSetting("diff-color-scheme")}
          description="Choose colors for additions and deletions, including change counts."
          resetAction={
            settings.diffColorScheme !== DEFAULT_UNIFIED_SETTINGS.diffColorScheme ? (
              <SettingResetButton
                label="diff colors"
                onClick={() =>
                  updateSettings({ diffColorScheme: DEFAULT_UNIFIED_SETTINGS.diffColorScheme })
                }
              />
            ) : null
          }
          control={
            <div className="w-full sm:w-40">
              <Select
                value={settings.diffColorScheme}
                onValueChange={(value) => {
                  if (value === "red-green" || value === "blue-orange")
                    updateSettings({ diffColorScheme: value });
                }}
              >
                <SelectTrigger size="sm" className="w-full min-w-0" aria-label="Diff colors">
                  <span
                    aria-hidden="true"
                    className={
                      settings.diffColorScheme === "blue-orange"
                        ? "flex shrink-0 flex-row-reverse gap-1"
                        : "flex shrink-0 gap-1"
                    }
                  >
                    <span className="size-2 rounded-full bg-diff-deletion" />
                    <span className="size-2 rounded-full bg-diff-addition" />
                  </span>
                  <SelectValue>
                    {settings.diffColorScheme === "blue-orange" ? "Blue & orange" : "Red & green"}
                  </SelectValue>
                </SelectTrigger>
                <SelectPopup align="end" alignItemWithTrigger={false}>
                  <SelectItem value="red-green">Red & green (default)</SelectItem>
                  <SelectItem value="blue-orange">Blue & orange</SelectItem>
                </SelectPopup>
              </Select>
            </div>
          }
        />

        <SettingsRow
          {...searchableSetting("composer-context")}
          description="Keep branch and worktree controls below the composer after a thread starts."
          resetAction={
            settings.persistComposerContextStrip !==
            DEFAULT_UNIFIED_SETTINGS.persistComposerContextStrip ? (
              <SettingResetButton
                label="composer context"
                onClick={() =>
                  updateSettings({
                    persistComposerContextStrip:
                      DEFAULT_UNIFIED_SETTINGS.persistComposerContextStrip,
                  })
                }
              />
            ) : null
          }
          control={
            <Switch
              checked={settings.persistComposerContextStrip}
              onCheckedChange={(checked) =>
                updateSettings({ persistComposerContextStrip: Boolean(checked) })
              }
              aria-label="Keep composer context visible in active threads"
            />
          }
        />

        <SettingsRow
          {...searchableSetting("chat-width")}
          description="Set how wide messages and the composer can grow on large screens."
          resetAction={
            settings.chatWidth !== DEFAULT_UNIFIED_SETTINGS.chatWidth ? (
              <SettingResetButton
                label="chat width"
                onClick={() => updateSettings({ chatWidth: DEFAULT_UNIFIED_SETTINGS.chatWidth })}
              />
            ) : null
          }
          control={
            <div className="w-full sm:w-40">
              <Select
                value={settings.chatWidth}
                onValueChange={(value) => {
                  if (value === "comfortable" || value === "wide" || value === "full")
                    updateSettings({ chatWidth: value });
                }}
              >
                <SelectTrigger size="sm" className="w-full min-w-0" aria-label="Chat width">
                  <SelectValue>{CHAT_WIDTH_LABELS[settings.chatWidth]}</SelectValue>
                </SelectTrigger>
                <SelectPopup align="end" alignItemWithTrigger={false}>
                  <SelectItem value="comfortable">Comfortable (default)</SelectItem>
                  <SelectItem value="wide">Wide</SelectItem>
                  <SelectItem value="full">Full</SelectItem>
                </SelectPopup>
              </Select>
            </div>
          }
        />
        <SettingsRow
          {...searchableSetting("math-rendering")}
          description="Typeset LaTeX math, such as $x^2$ or \[x^2\], in messages and Markdown previews. The composer keeps TeX source editable."
          resetAction={
            settings.mathRenderingEnabled !== DEFAULT_UNIFIED_SETTINGS.mathRenderingEnabled ? (
              <SettingResetButton
                label="math rendering"
                onClick={() =>
                  updateSettings({
                    mathRenderingEnabled: DEFAULT_UNIFIED_SETTINGS.mathRenderingEnabled,
                  })
                }
              />
            ) : null
          }
          control={
            <Switch
              checked={settings.mathRenderingEnabled}
              onCheckedChange={(checked) =>
                updateSettings({ mathRenderingEnabled: Boolean(checked) })
              }
              aria-label="Render math"
            />
          }
        />
      </SettingsSection>

      <SettingsSection id="motion" title="Motion">
        <SettingsRow
          {...searchableSetting("panel-animations")}
          description="Set how fast panels open and close."
          control={
            <div className="grid w-full grid-cols-[5rem_minmax(0,1fr)] items-center gap-3 sm:w-auto sm:grid-cols-[7rem_13rem] sm:gap-4">
              <PanelAnimationsPreview durationMs={settings.panelAnimationDurationMs} />
              <div className="flex w-full items-center gap-3">
                <output
                  className="min-w-16 rounded-md bg-muted px-2 py-1 text-center font-mono text-xs font-medium tabular-nums text-foreground"
                  htmlFor="panel-animation-duration"
                >
                  {settings.panelAnimationDurationMs} ms
                </output>
                <input
                  aria-label="Panel animation duration"
                  className="settings-slider min-w-0 flex-1"
                  id="panel-animation-duration"
                  max={MAX_PANEL_ANIMATION_DURATION_MS}
                  min={MIN_PANEL_ANIMATION_DURATION_MS}
                  onChange={(event) => {
                    const panelAnimationDurationMs = Number(event.currentTarget.value);
                    if (
                      Number.isInteger(panelAnimationDurationMs) &&
                      panelAnimationDurationMs >= MIN_PANEL_ANIMATION_DURATION_MS &&
                      panelAnimationDurationMs <= MAX_PANEL_ANIMATION_DURATION_MS
                    ) {
                      updateSettings({ panelAnimationDurationMs });
                    }
                  }}
                  step={25}
                  style={panelAnimationDurationSliderStyle}
                  type="range"
                  value={settings.panelAnimationDurationMs}
                />
              </div>
            </div>
          }
          resetAction={
            settings.panelAnimationDurationMs !==
            DEFAULT_UNIFIED_SETTINGS.panelAnimationDurationMs ? (
              <SettingResetButton
                label="panel animations"
                onClick={() =>
                  updateSettings({
                    panelAnimationDurationMs: DEFAULT_UNIFIED_SETTINGS.panelAnimationDurationMs,
                  })
                }
              />
            ) : null
          }
        />
      </SettingsSection>

      <SettingsSection id="privacy" title="Privacy">
        <SettingsRow
          {...searchableSetting("private-project-names")}
          description="Show stand-in names like “Project Alpha” instead of your real project names in the sidebar, the thread header, and the new-thread picker. Useful while streaming or taking screenshots. Nothing is renamed: file paths, agent output, and the Projects settings page still show the real name."
          control={
            <Switch
              checked={settings.privateProjectNames}
              onCheckedChange={(checked) =>
                updateSettings({ privateProjectNames: Boolean(checked) })
              }
              aria-label="Show stand-in project names"
            />
          }
        />
      </SettingsSection>

      <UsageMeterSettingsSection />
    </SettingsPageContainer>
  );
}
