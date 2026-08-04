import type { DiffsHighlighter } from "@pierre/diffs";
import { beforeEach, expect, it, vi } from "vite-plus/test";

const { getSharedHighlighter } = vi.hoisted(() => ({
  getSharedHighlighter: vi.fn(),
}));

vi.mock("@pierre/diffs", () => ({
  getSharedHighlighter,
}));

import { getSyntaxHighlighterPromise } from "./syntaxHighlighting";

beforeEach(() => {
  getSharedHighlighter.mockReset();
});

it("loads only the selected syntax theme", async () => {
  const highlighter = {} as DiffsHighlighter;
  getSharedHighlighter.mockResolvedValue(highlighter);

  await expect(getSyntaxHighlighterPromise("typescript", "tokyo-night")).resolves.toBe(highlighter);

  expect(getSharedHighlighter).toHaveBeenCalledWith({
    themes: ["tokyo-night"],
    langs: ["typescript"],
    preferredHighlighter: "shiki-js",
  });
});

it("caches the recovered text highlighter for unsupported languages", async () => {
  const textHighlighter = {} as DiffsHighlighter;
  getSharedHighlighter.mockImplementation(({ langs }: { langs: string[] }) =>
    langs[0] === "text"
      ? Promise.resolve(textHighlighter)
      : Promise.reject(new Error("unsupported language")),
  );

  const first = getSyntaxHighlighterPromise("unsupported-test-language");
  await expect(first).resolves.toBe(textHighlighter);
  const second = getSyntaxHighlighterPromise("unsupported-test-language");

  expect(second).toBe(first);
  expect(getSharedHighlighter).toHaveBeenCalledTimes(2);
});
