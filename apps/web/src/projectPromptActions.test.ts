import { describe, expect, it } from "vite-plus/test";

import { appendProjectPrompt, buildProjectPromptAction } from "./projectPromptActions";

describe("project prompt actions", () => {
  it("preserves the exact saved model selection", () => {
    expect(
      buildProjectPromptAction("review", {
        name: "Review",
        prompt: "Review these changes.",
        icon: "lint",
        modelSelection: {
          instanceId: "codex-personal" as never,
          model: "gpt-5.4",
          options: [
            { id: "effort", value: "high" },
            { id: "fastMode", value: true },
          ],
        },
      }),
    ).toEqual({
      id: "review",
      name: "Review",
      prompt: "Review these changes.",
      icon: "lint",
      modelSelection: {
        instanceId: "codex-personal",
        model: "gpt-5.4",
        options: [
          { id: "effort", value: "high" },
          { id: "fastMode", value: true },
        ],
      },
    });
  });

  it("adds a saved prompt after one blank line", () => {
    expect(appendProjectPrompt("Existing text", "Saved prompt")).toBe(
      "Existing text\n\nSaved prompt",
    );
    expect(appendProjectPrompt("Existing text\n\n", "Saved prompt")).toBe(
      "Existing text\n\nSaved prompt",
    );
    expect(appendProjectPrompt("", "Saved prompt")).toBe("Saved prompt");
  });
});
