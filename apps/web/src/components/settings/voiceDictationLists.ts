/**
 * The rules behind the two lists on the Voice settings page.
 *
 * Kept out of the components because these are the parts with opinions —
 * what counts as a duplicate, what a bad entry should say, how a snippet gets
 * an id that survives being renamed. Each returns the next list plus a message
 * to show, so the caller never has to decide whether an edit was accepted.
 */
import {
  MAX_VOICE_DICTIONARY_TERMS,
  MAX_VOICE_SNIPPETS,
  type VoiceDictationSnippet,
} from "@t3tools/contracts/settings";

/** Long enough for a full company name, short enough to stay a term. */
export const MAX_DICTIONARY_TERM_LENGTH = 80;
export const MAX_SNIPPET_TRIGGER_LENGTH = 80;
export const MAX_SNIPPET_REPLACEMENT_LENGTH = 2_000;

export interface ListEditResult<T> {
  /** `null` when the edit was rejected, so the caller writes nothing. */
  readonly next: ReadonlyArray<T> | null;
  readonly error: string | null;
}

const rejected = <T>(error: string): ListEditResult<T> => ({ next: null, error });

export function addDictionaryTerm(
  terms: ReadonlyArray<string>,
  raw: string,
): ListEditResult<string> {
  const term = raw.trim().replace(/\s+/g, " ");
  if (term.length === 0) return rejected("Type a word or name first.");
  if (term.length > MAX_DICTIONARY_TERM_LENGTH) {
    return rejected(`Keep terms under ${MAX_DICTIONARY_TERM_LENGTH} characters.`);
  }
  // Case-insensitively, because the point of the list is to teach a spelling:
  // holding both "Vortechron" and "vortechron" would just contradict itself.
  if (terms.some((existing) => existing.toLowerCase() === term.toLowerCase())) {
    return rejected("That term is already in the dictionary.");
  }
  if (terms.length >= MAX_VOICE_DICTIONARY_TERMS) {
    return rejected(`The dictionary holds up to ${MAX_VOICE_DICTIONARY_TERMS} terms.`);
  }
  return { next: [...terms, term], error: null };
}

export function removeDictionaryTerm(
  terms: ReadonlyArray<string>,
  term: string,
): ReadonlyArray<string> {
  return terms.filter((existing) => existing !== term);
}

function slugifySnippetId(trigger: string): string {
  const slug = trigger
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug.length > 0 ? slug : "snippet";
}

/** A readable id derived from the trigger, suffixed until it is free. */
export function nextSnippetId(trigger: string, takenIds: Iterable<string>): string {
  const taken = new Set(takenIds);
  const base = slugifySnippetId(trigger);
  if (!taken.has(base)) return base;

  for (let suffix = 2; suffix < 1_000; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}-${taken.size + 1}`;
}

/**
 * Adds a snippet, or replaces the one whose id is `editingId`.
 *
 * Editing keeps the original id even when the trigger changes, so a snippet
 * being reworded stays the same snippet rather than becoming a new row.
 */
export function upsertSnippet(
  snippets: ReadonlyArray<VoiceDictationSnippet>,
  input: { readonly trigger: string; readonly replacement: string; readonly editingId?: string },
): ListEditResult<VoiceDictationSnippet> {
  const trigger = input.trigger.trim().replace(/\s+/g, " ");
  const replacement = input.replacement.trim();

  if (trigger.length === 0) return rejected("Type the phrase you will say.");
  if (replacement.length === 0) return rejected("Type the text it should become.");
  if (trigger.length > MAX_SNIPPET_TRIGGER_LENGTH) {
    return rejected(`Keep the spoken phrase under ${MAX_SNIPPET_TRIGGER_LENGTH} characters.`);
  }
  if (replacement.length > MAX_SNIPPET_REPLACEMENT_LENGTH) {
    return rejected(`Keep the text under ${MAX_SNIPPET_REPLACEMENT_LENGTH} characters.`);
  }
  if (
    snippets.some(
      (existing) =>
        existing.id !== input.editingId && existing.trigger.toLowerCase() === trigger.toLowerCase(),
    )
  ) {
    return rejected("Another snippet already uses that phrase.");
  }

  if (input.editingId !== undefined) {
    return {
      next: snippets.map((existing) =>
        existing.id === input.editingId ? { ...existing, trigger, replacement } : existing,
      ),
      error: null,
    };
  }

  if (snippets.length >= MAX_VOICE_SNIPPETS) {
    return rejected(`You can save up to ${MAX_VOICE_SNIPPETS} snippets.`);
  }
  const id = nextSnippetId(
    trigger,
    snippets.map((existing) => existing.id),
  );
  return { next: [...snippets, { id, trigger, replacement }], error: null };
}

export function removeSnippet(
  snippets: ReadonlyArray<VoiceDictationSnippet>,
  id: string,
): ReadonlyArray<VoiceDictationSnippet> {
  return snippets.filter((snippet) => snippet.id !== id);
}
