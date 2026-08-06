import { describe, expect, it } from "vite-plus/test";

import {
  addDictionaryTerm,
  MAX_DICTIONARY_TERM_LENGTH,
  nextSnippetId,
  removeDictionaryTerm,
  removeSnippet,
  upsertSnippet,
} from "./voiceDictationLists";

describe("dictionary terms", () => {
  it("adds a term and tidies the spacing around it", () => {
    expect(addDictionaryTerm([], "  Wispr   Flow  ")).toEqual({
      next: ["Wispr Flow"],
      error: null,
    });
  });

  it("refuses a blank term", () => {
    expect(addDictionaryTerm([], "   ").next).toBeNull();
  });

  it("refuses a term that only differs by case", () => {
    const result = addDictionaryTerm(["Vortechron"], "vortechron");

    expect(result.next).toBeNull();
    expect(result.error).toBe("That term is already in the dictionary.");
  });

  it("refuses a term longer than the cap", () => {
    expect(addDictionaryTerm([], "x".repeat(MAX_DICTIONARY_TERM_LENGTH + 1)).next).toBeNull();
  });

  it("refuses to grow past the list cap", () => {
    const full = Array.from({ length: 100 }, (_, index) => `term-${index}`);

    expect(addDictionaryTerm(full, "one more").next).toBeNull();
  });

  it("removes only the term asked for", () => {
    expect(removeDictionaryTerm(["a", "b", "c"], "b")).toEqual(["a", "c"]);
  });
});

describe("snippet ids", () => {
  it("derives a readable id from the spoken phrase", () => {
    expect(nextSnippetId("my email address", [])).toBe("my-email-address");
  });

  it("suffixes until the id is free", () => {
    expect(nextSnippetId("my email", ["my-email"])).toBe("my-email-2");
    expect(nextSnippetId("my email", ["my-email", "my-email-2"])).toBe("my-email-3");
  });

  it("falls back to a usable id when the phrase has no letters", () => {
    expect(nextSnippetId("!!!", [])).toBe("snippet");
  });
});

describe("snippets", () => {
  const existing = [{ id: "my-email", trigger: "my email", replacement: "hi@example.com" }];

  it("adds a snippet with an id derived from its trigger", () => {
    const result = upsertSnippet([], { trigger: "my email", replacement: "hi@example.com" });

    expect(result.next).toEqual([
      { id: "my-email", trigger: "my email", replacement: "hi@example.com" },
    ]);
  });

  it("requires both halves", () => {
    expect(upsertSnippet([], { trigger: "", replacement: "hi" }).next).toBeNull();
    expect(upsertSnippet([], { trigger: "hi", replacement: "  " }).next).toBeNull();
  });

  it("refuses a second snippet with the same spoken phrase", () => {
    const result = upsertSnippet(existing, { trigger: "My Email", replacement: "other@x.com" });

    expect(result.next).toBeNull();
    expect(result.error).toBe("Another snippet already uses that phrase.");
  });

  it("keeps the original id when a snippet is edited", () => {
    const result = upsertSnippet(existing, {
      trigger: "my work email",
      replacement: "work@example.com",
      editingId: "my-email",
    });

    expect(result.next).toEqual([
      { id: "my-email", trigger: "my work email", replacement: "work@example.com" },
    ]);
  });

  it("lets an edit keep its own trigger without tripping the duplicate check", () => {
    const result = upsertSnippet(existing, {
      trigger: "my email",
      replacement: "changed@example.com",
      editingId: "my-email",
    });

    expect(result.next?.[0]?.replacement).toBe("changed@example.com");
  });

  it("refuses to grow past the list cap but still allows edits", () => {
    const full = Array.from({ length: 50 }, (_, index) => ({
      id: `s-${index}`,
      trigger: `trigger ${index}`,
      replacement: "text",
    }));

    expect(upsertSnippet(full, { trigger: "new one", replacement: "text" }).next).toBeNull();
    expect(
      upsertSnippet(full, { trigger: "renamed", replacement: "text", editingId: "s-0" }).next,
    ).not.toBeNull();
  });

  it("removes only the snippet asked for", () => {
    expect(removeSnippet(existing, "my-email")).toEqual([]);
    expect(removeSnippet(existing, "other")).toEqual(existing);
  });
});
