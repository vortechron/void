import { describe, expect, it } from "vite-plus/test";

import { isSendableOpenAiApiKey, normalizeOpenAiApiKey } from "./apiKey";

describe("normalizeOpenAiApiKey", () => {
  it("keeps a plain key as it is", () => {
    expect(normalizeOpenAiApiKey("sk-proj-abc123")).toBe("sk-proj-abc123");
  });

  it("drops the environment variable name a pasted .env line brings with it", () => {
    expect(normalizeOpenAiApiKey("OPENAI_API_KEY=sk-proj-abc123")).toBe("sk-proj-abc123");
    expect(normalizeOpenAiApiKey("export OPENAI_API_KEY = sk-proj-abc123")).toBe("sk-proj-abc123");
  });

  it("drops quotes around the value", () => {
    expect(normalizeOpenAiApiKey(`OPENAI_API_KEY="sk-proj-abc123"`)).toBe("sk-proj-abc123");
    expect(normalizeOpenAiApiKey(`'sk-proj-abc123'`)).toBe("sk-proj-abc123");
  });

  it("trims surrounding whitespace and newlines", () => {
    expect(normalizeOpenAiApiKey("  sk-proj-abc123\n")).toBe("sk-proj-abc123");
  });

  it("leaves an unrelated variable name alone rather than guessing", () => {
    expect(normalizeOpenAiApiKey("MY_KEY=sk-proj-abc123")).toBe("MY_KEY=sk-proj-abc123");
  });
});

describe("isSendableOpenAiApiKey", () => {
  it("accepts the characters OpenAI keys are made of", () => {
    expect(isSendableOpenAiApiKey("sk-proj-Abc123_-XY")).toBe(true);
  });

  it("rejects a value the WebSocket handshake would refuse", () => {
    expect(isSendableOpenAiApiKey("MY_KEY=sk-proj-abc123")).toBe(false);
    expect(isSendableOpenAiApiKey("sk-proj abc123")).toBe(false);
    expect(isSendableOpenAiApiKey("")).toBe(false);
  });
});
