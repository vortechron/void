/**
 * Spoken shortcuts, expanded in the transcript before it reaches the composer.
 *
 * This is deliberately plain string replacement rather than something the
 * cleanup model is asked to do: an address or a referral link has to come out
 * character-for-character every time, and "off" is a supported style, so
 * snippets cannot depend on a pass that may never run.
 */
import type { VoiceDictationSnippet } from "@t3tools/contracts/settings";

function escapeForRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * `\b` only sits against a word character, so a trigger that starts or ends
 * with punctuation would never match with one applied blindly. Anchoring each
 * end only when it can be anchored keeps "my email" bounded while still
 * letting a trigger like "(brb)" work.
 */
function triggerPattern(trigger: string): RegExp {
  const escaped = escapeForRegex(trigger);
  const openBoundary = /^\w/.test(trigger) ? "\\b" : "";
  const closeBoundary = /\w$/.test(trigger) ? "\\b" : "";
  return new RegExp(`${openBoundary}${escaped}${closeBoundary}`, "gi");
}

/**
 * Expands every snippet trigger found in `text`.
 *
 * Longest trigger first, so "my work email" wins over "my email" where both
 * would match. Replacements are never re-scanned, so a snippet whose text
 * happens to contain another trigger expands once rather than cascading.
 */
export function applySnippets(
  text: string,
  snippets: ReadonlyArray<VoiceDictationSnippet>,
): string {
  if (text.length === 0 || snippets.length === 0) return text;

  const ordered = [...snippets]
    .filter((snippet) => snippet.trigger.length > 0)
    .sort((left, right) => right.trigger.length - left.trigger.length);

  // Segments alternate between text still open to matching and text already
  // replaced. Only the former is scanned by later snippets.
  let segments: ReadonlyArray<{ text: string; expanded: boolean }> = [{ text, expanded: false }];

  for (const snippet of ordered) {
    const pattern = triggerPattern(snippet.trigger);
    segments = segments.flatMap((segment) => {
      if (segment.expanded) return [segment];

      const pieces: Array<{ text: string; expanded: boolean }> = [];
      let lastIndex = 0;
      for (const match of segment.text.matchAll(pattern)) {
        const start = match.index;
        if (start > lastIndex) {
          pieces.push({ text: segment.text.slice(lastIndex, start), expanded: false });
        }
        pieces.push({ text: snippet.replacement, expanded: true });
        lastIndex = start + match[0].length;
      }
      if (pieces.length === 0) return [segment];
      if (lastIndex < segment.text.length) {
        pieces.push({ text: segment.text.slice(lastIndex), expanded: false });
      }
      return pieces;
    });
  }

  return segments.map((segment) => segment.text).join("");
}
