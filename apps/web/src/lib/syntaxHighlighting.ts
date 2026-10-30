import {
  getSharedHighlighter,
  type DiffsHighlighter,
  type DiffsThemeNames,
  type HighlighterTypes,
  type SupportedLanguages,
} from "@pierre/diffs";

import { resolveDiffThemeName } from "./diffRendering";

/**
 * Highlights' hand-written WASM lexers tokenize large files 10-40x faster than
 * Shiki and never backtrack like Shiki's JS regex engine. Only one highlighter
 * type can be active per thread, so every creation site must pass this value.
 */
export const PREFERRED_HIGHLIGHTER: HighlighterTypes = "highlights";

const highlighterPromiseCache = new Map<string, Promise<DiffsHighlighter>>();

export function getSyntaxHighlighterPromise(
  language: string,
  theme?: DiffsThemeNames,
): Promise<DiffsHighlighter> {
  const cacheKey = `${language}:${theme ?? "light-and-dark"}`;
  const cached = highlighterPromiseCache.get(cacheKey);
  if (cached) return cached;

  const promise = getSharedHighlighter({
    // Void: a caller that names the synced code theme loads only that one.
    // Upstream callers pick light or dark per render, so they get both.
    themes: theme ? [theme] : [resolveDiffThemeName("dark"), resolveDiffThemeName("light")],
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
