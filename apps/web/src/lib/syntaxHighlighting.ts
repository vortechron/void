import {
  getSharedHighlighter,
  type DiffsHighlighter,
  type DiffsThemeNames,
  type SupportedLanguages,
} from "@pierre/diffs";

import { resolveDiffThemeName } from "./diffRendering";

const highlighterPromiseCache = new Map<string, Promise<DiffsHighlighter>>();

export function getSyntaxHighlighterPromise(
  language: string,
  theme: DiffsThemeNames = resolveDiffThemeName("dark"),
): Promise<DiffsHighlighter> {
  const cacheKey = `${language}:${theme}`;
  const cached = highlighterPromiseCache.get(cacheKey);
  if (cached) return cached;

  const promise = getSharedHighlighter({
    themes: [theme],
    langs: [language as SupportedLanguages],
    preferredHighlighter: "shiki-js",
  }).catch((error) => {
    if (language === "text") {
      highlighterPromiseCache.delete(cacheKey);
      // "text" itself failed — Shiki cannot initialize at all, surface the error
      throw error;
    }
    // Language not supported by Shiki — fall back to "text"
    return getSyntaxHighlighterPromise("text", theme);
  });
  highlighterPromiseCache.set(cacheKey, promise);
  return promise;
}
