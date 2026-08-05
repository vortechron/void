import { describe, expect, it } from "vite-plus/test";

import {
  appendProjectPrompt,
  buildProjectPromptActionNewTaskRouteParams,
  resolveProjectPromptActionWorkspaceSelection,
} from "./projectPromptActions";

describe("project prompt actions", () => {
  it("appends after one blank line", () => {
    expect(appendProjectPrompt("Existing\n\n", "Saved prompt")).toBe("Existing\n\nSaved prompt");
  });

  it("carries an existing worktree into an isolated new-task draft", () => {
    const routeParams = buildProjectPromptActionNewTaskRouteParams({
      environmentId: "environment-1",
      projectId: "project-1",
      title: "Review",
      promptActionId: "review",
      promptActionDraftKey: "project-prompt:123",
      branch: "feature/prompt-actions",
      worktreePath: "/workspace/project-prompt-actions",
    });

    expect(resolveProjectPromptActionWorkspaceSelection(routeParams)).toEqual({
      mode: "local",
      branch: "feature/prompt-actions",
      worktreePath: "/workspace/project-prompt-actions",
      startFromOrigin: false,
    });
  });
});
