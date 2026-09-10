import { describe, expect, it } from "vite-plus/test";

import {
  isAppTheme,
  isUiZoomActive,
  resolveAppTheme,
  resolveAppearanceCssVariables,
} from "./appearancePreferences";

describe("appearance preferences", () => {
  it("resolves named themes to the correct native color mode", () => {
    expect(resolveAppTheme("system", false)).toBe("light");
    expect(resolveAppTheme("system", true)).toBe("dark");
    expect(resolveAppTheme("catppuccin-latte", true)).toBe("light");
    expect(resolveAppTheme("tokyo-night", false)).toBe("dark");
    expect(isAppTheme("solarized-dark")).toBe(true);
    expect(isAppTheme("unknown")).toBe(false);
  });

  it("maps stored font preferences to live CSS variables", () => {
    expect(
      resolveAppearanceCssVariables({
        uiFontFamily: "system",
        uiFontSize: 18,
        uiZoom: 80,
        codeFontFamily: "jetbrains-mono",
        codeFontSize: 15,
      }),
    ).toEqual({
      "--ui-font-family": '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
      "--code-font-family":
        '"JetBrains Mono", "SF Mono", "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace',
      "--ui-font-scale": "1.125",
      "--ui-zoom": "0.8",
      "--code-font-size": "15px",
      "--code-line-height": "23px",
    });
  });

  it("only treats zoom as active once it leaves the default", () => {
    expect(isUiZoomActive(100)).toBe(false);
    expect(isUiZoomActive(80)).toBe(true);
    expect(isUiZoomActive(125)).toBe(true);
  });

  it("uses an installed font family before the safe platform fallback", () => {
    expect(
      resolveAppearanceCssVariables({
        uiFontFamily: 'A "Quoted" Font',
        uiFontSize: 16,
        uiZoom: 100,
        codeFontFamily: "Berkeley Mono",
        codeFontSize: 13,
      }),
    ).toMatchObject({
      "--ui-font-family":
        '"A \\"Quoted\\" Font", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
      "--code-font-family":
        '"Berkeley Mono", ui-monospace, "SF Mono", "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace',
    });
  });
});
