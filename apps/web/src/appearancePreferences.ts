import type { CodeFontFamily, CodeTheme, UiFontFamily } from "@t3tools/contracts/settings";

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

export type AppTheme = (typeof APP_THEME_VALUES)[number];
export type ResolvedAppTheme = "light" | "dark";

export const APP_THEME_OPTIONS: ReadonlyArray<{ value: AppTheme; label: string }> = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "catppuccin-latte", label: "Catppuccin Latte" },
  { value: "catppuccin-macchiato", label: "Catppuccin Macchiato" },
  { value: "catppuccin-mocha", label: "Catppuccin Mocha" },
  { value: "dracula", label: "Dracula" },
  { value: "nord", label: "Nord" },
  { value: "tokyo-night", label: "Tokyo Night" },
  { value: "gruvbox-dark", label: "Gruvbox Dark" },
  { value: "solarized-dark", label: "Solarized Dark" },
];

export const UI_FONT_OPTIONS = [
  { value: "dm-sans", label: "DM Sans" },
  { value: "system", label: "System UI" },
  { value: "serif", label: "System Serif" },
] as const satisfies ReadonlyArray<{ value: UiFontFamily; label: string }>;

export const CODE_FONT_OPTIONS = [
  { value: "system-mono", label: "System Mono" },
  { value: "jetbrains-mono", label: "JetBrains Mono" },
  { value: "monospace", label: "Browser Monospace" },
] as const satisfies ReadonlyArray<{ value: CodeFontFamily; label: string }>;

export const CODE_THEME_OPTIONS: ReadonlyArray<{ value: CodeTheme; label: string }> = [
  { value: "default", label: "Default" },
  { value: "catppuccin-latte", label: "Catppuccin Latte" },
  { value: "catppuccin-macchiato", label: "Catppuccin Macchiato" },
  { value: "catppuccin-mocha", label: "Catppuccin Mocha" },
  { value: "dracula", label: "Dracula" },
  { value: "nord", label: "Nord" },
  { value: "tokyo-night", label: "Tokyo Night" },
  { value: "gruvbox-dark", label: "Gruvbox Dark" },
  { value: "solarized-dark", label: "Solarized Dark" },
];

type UiFontPreset = (typeof UI_FONT_OPTIONS)[number]["value"];
type CodeFontPreset = (typeof CODE_FONT_OPTIONS)[number]["value"];

const UI_LOCAL_FONT_FALLBACK =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif';
const CODE_LOCAL_FONT_FALLBACK =
  'ui-monospace, "SF Mono", "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace';

const UI_FONT_STACKS: Record<UiFontPreset, string> = {
  "dm-sans":
    '"DM Sans Variable", "DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
  system: UI_LOCAL_FONT_FALLBACK,
  serif: 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif',
};

const CODE_FONT_STACKS: Record<CodeFontPreset, string> = {
  "system-mono":
    '"SF Mono", "SFMono-Regular", "JetBrains Mono", Consolas, "Liberation Mono", Menlo, monospace',
  "jetbrains-mono":
    '"JetBrains Mono", "SF Mono", "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace',
  monospace: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
};

function resolveFontStack<Preset extends string>(
  family: string,
  presets: Readonly<Record<Preset, string>>,
  fallback: string,
): string {
  if (Object.hasOwn(presets, family)) {
    return presets[family as Preset];
  }
  return `${JSON.stringify(family)}, ${fallback}`;
}

const APP_THEME_VALUE_SET = new Set<string>(APP_THEME_VALUES);

export function isAppTheme(value: unknown): value is AppTheme {
  return typeof value === "string" && APP_THEME_VALUE_SET.has(value);
}

export function resolveAppTheme(theme: AppTheme, systemDark: boolean): ResolvedAppTheme {
  if (theme === "system") return systemDark ? "dark" : "light";
  if (theme === "light" || theme === "catppuccin-latte") return "light";
  return "dark";
}

export function resolveAppearanceCssVariables(settings: {
  readonly uiFontFamily: UiFontFamily;
  readonly uiFontSize: number;
  readonly codeFontFamily: CodeFontFamily;
  readonly codeFontSize: number;
}): Readonly<Record<string, string>> {
  return {
    "--ui-font-family": resolveFontStack(
      settings.uiFontFamily,
      UI_FONT_STACKS,
      UI_LOCAL_FONT_FALLBACK,
    ),
    "--code-font-family": resolveFontStack(
      settings.codeFontFamily,
      CODE_FONT_STACKS,
      CODE_LOCAL_FONT_FALLBACK,
    ),
    "--ui-font-scale": String(settings.uiFontSize / 16),
    "--code-font-size": `${settings.codeFontSize}px`,
    "--code-line-height": `${Math.max(settings.codeFontSize + 6, Math.round(settings.codeFontSize * 1.5))}px`,
  };
}
