import type { ProjectPromptAction, ProjectScript } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { mergedActions, scopedActions, setupProjectScript } from "./projectScripts.ts";

const script = (id: string, runOnWorktreeCreate = false): ProjectScript => ({
  id,
  name: id,
  command: `run ${id}`,
  icon: "play",
  runOnWorktreeCreate,
});

const promptAction = (id: string): ProjectPromptAction => ({
  id,
  name: id,
  icon: "play",
  prompt: `prompt ${id}`,
  modelSelection: { instanceId: "codex", model: "gpt-5" } as ProjectPromptAction["modelSelection"],
});

describe("scopedActions", () => {
  it("tags each command action with the store it came from, project first", () => {
    const entries = scopedActions({
      project: [script("build")],
      global: [script("install")],
    });

    expect(entries).toEqual([
      { scope: "project", action: script("build") },
      { scope: "global", action: script("install") },
    ]);
  });

  it("orders prompt actions the same way", () => {
    const entries = scopedActions({
      project: [promptAction("review")],
      global: [promptAction("explain")],
    });

    expect(entries.map((entry) => [entry.scope, entry.action.id])).toEqual([
      ["project", "review"],
      ["global", "explain"],
    ]);
  });

  it("treats missing lists as empty", () => {
    expect(scopedActions({})).toEqual([]);
    expect(mergedActions({ global: [script("install")] })).toEqual([script("install")]);
    expect(mergedActions({ global: [promptAction("explain")] })).toEqual([promptAction("explain")]);
  });
});

describe("setupProjectScript", () => {
  it("prefers the project's setup script over the global one", () => {
    const merged = mergedActions({
      project: [script("project-setup", true)],
      global: [script("global-setup", true)],
    });

    expect(setupProjectScript(merged)?.id).toBe("project-setup");
  });

  it("falls back to the global setup script when the project has none", () => {
    const merged = mergedActions({
      project: [script("build")],
      global: [script("global-setup", true)],
    });

    expect(setupProjectScript(merged)?.id).toBe("global-setup");
  });

  it("returns null when neither scope declares one", () => {
    expect(setupProjectScript(mergedActions({ project: [script("build")] }))).toBeNull();
  });
});
