import { describe, expect, it } from "vite-plus/test";

import { applySnippets } from "./snippets";

const snippet = (id: string, trigger: string, replacement: string) => ({
  id,
  trigger,
  replacement,
});

describe("voice dictation snippets", () => {
  it("expands a trigger in the middle of a sentence", () => {
    const result = applySnippets("send it to my email please", [
      snippet("email", "my email", "hi@example.com"),
    ]);

    expect(result).toBe("send it to hi@example.com please");
  });

  it("matches regardless of how the transcript capitalised the trigger", () => {
    const result = applySnippets("My Email is the one to use", [
      snippet("email", "my email", "hi@example.com"),
    ]);

    expect(result).toBe("hi@example.com is the one to use");
  });

  it("expands every occurrence", () => {
    const result = applySnippets("my email, then my email again", [
      snippet("email", "my email", "hi@example.com"),
    ]);

    expect(result).toBe("hi@example.com, then hi@example.com again");
  });

  it("respects word boundaries", () => {
    // "brb" inside "brbxyz" is not the shortcut being spoken.
    const result = applySnippets("brb and brbxyz", [snippet("brb", "brb", "be right back")]);

    expect(result).toBe("be right back and brbxyz");
  });

  it("prefers the longest trigger when two overlap", () => {
    const result = applySnippets("use my work email", [
      snippet("email", "my email", "personal@example.com"),
      snippet("work", "my work email", "work@example.com"),
    ]);

    expect(result).toBe("use work@example.com");
  });

  it("does not re-scan a replacement, so snippets cannot cascade", () => {
    const result = applySnippets("say hello", [
      snippet("hello", "hello", "my email"),
      snippet("email", "my email", "hi@example.com"),
    ]);

    // "my email" arrived as a replacement, not as something the user said.
    expect(result).toBe("say my email");
  });

  it("leaves text alone when nothing matches", () => {
    expect(applySnippets("nothing to expand", [snippet("brb", "brb", "be right back")])).toBe(
      "nothing to expand",
    );
  });

  it("returns the text unchanged when there are no snippets", () => {
    expect(applySnippets("just words", [])).toBe("just words");
  });

  it("handles a trigger that is not made of word characters", () => {
    const result = applySnippets("wrap it (brb) here", [snippet("brb", "(brb)", "be right back")]);

    expect(result).toBe("wrap it be right back here");
  });

  it("treats a regex-special trigger as literal text", () => {
    const result = applySnippets("the c++ part", [snippet("cpp", "c++", "C plus plus")]);

    expect(result).toBe("the C plus plus part");
  });
});
