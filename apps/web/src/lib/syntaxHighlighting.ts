import {
  getSharedHighlighter,
  type DiffsHighlighter,
  type DiffsThemeNames,
  type HighlighterTypes,
  type SupportedLanguages,
} from "@pierre/diffs";

import { resolveDiffThemeName } from "./diffRendering";

/**
 * Always highlight with the Oniguruma WASM engine — the JS regex engine can
 * backtrack catastrophically and hang the tokenizing thread. The shared
 * highlighter is a first-caller-wins singleton, so every creation site must
 * pass this value.
 */
export const PREFERRED_HIGHLIGHTER: HighlighterTypes = "shiki-wasm";

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
    preferredHighlighter: PREFERRED_HIGHLIGHTER,
  }).catch((error) => {
    if (language === "text") {
      highlighterPromiseCache.delete(cacheKey);
      throw error;
    }
    return getSyntaxHighlighterPromise("text", theme);
  });
  highlighterPromiseCache.set(cacheKey, promise);
  return promise;
}
