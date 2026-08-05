import { describe, expect, it } from "vite-plus/test";
import {
  projectScriptCwd,
  projectScriptRuntimeEnv,
  setupProjectScript,
} from "@t3tools/shared/projectScripts";

import {
  buildProjectScript,
  commandForProjectScript,
  importableFileScripts,
  nextProjectScriptId,
  primaryProjectScript,
  projectScriptIdFromCommand,
  withScriptUpsert,
} from "./projectScripts";

describe("projectScripts helpers", () => {
  it("builds scripts with preview settings", () => {
    expect(
      buildProjectScript("dev", {
        name: "Dev server",
        command: "pnpm dev",
        icon: "debug",
        runOnWorktreeCreate: false,
        previewUrl: "http://localhost:5733",
        autoOpenPreview: true,
      }),
    ).toEqual({
      id: "dev",
      name: "Dev server",
      command: "pnpm dev",
      icon: "debug",
      runOnWorktreeCreate: false,
      previewUrl: "http://localhost:5733",
      autoOpenPreview: true,
    });
  });

  it("omits preview settings when no preview URL is configured", () => {
    expect(
      buildProjectScript("test", {
        name: "Test",
        command: "pnpm test",
        icon: "test",
        runOnWorktreeCreate: false,
        previewUrl: null,
        autoOpenPreview: false,
      }),
    ).toEqual({
      id: "test",
      name: "Test",
      command: "pnpm test",
      icon: "test",
      runOnWorktreeCreate: false,
    });
  });

  it("builds and parses script run commands", () => {
    const command = commandForProjectScript("lint");
    expect(command).toBe("script.lint.run");
    expect(projectScriptIdFromCommand(command)).toBe("lint");
    expect(projectScriptIdFromCommand("terminal.toggle")).toBeNull();
  });

  it("slugifies and dedupes project script ids", () => {
    expect(nextProjectScriptId("Run Tests", [])).toBe("run-tests");
    expect(nextProjectScriptId("Run Tests", ["run-tests"])).toBe("run-tests-2");
    expect(nextProjectScriptId("!!!", [])).toBe("script");
  });

  it("resolves primary and setup scripts", () => {
    const scripts = [
      {
        id: "setup",
        name: "Setup",
        command: "bun install",
        icon: "configure" as const,
        runOnWorktreeCreate: true,
      },
      {
        id: "test",
        name: "Test",
        command: "bun test",
        icon: "test" as const,
        runOnWorktreeCreate: false,
      },
    ];

    expect(primaryProjectScript(scripts)?.id).toBe("test");
    expect(setupProjectScript(scripts)?.id).toBe("setup");
  });

  it("builds default runtime env for scripts", () => {
    const env = projectScriptRuntimeEnv({
      project: { cwd: "/repo" },
      worktreePath: "/repo/worktree-a",
    });

    expect(env).toMatchObject({
      T3CODE_PROJECT_ROOT: "/repo",
      T3CODE_WORKTREE_PATH: "/repo/worktree-a",
    });
  });

  it("allows overriding runtime env values", () => {
    const env = projectScriptRuntimeEnv({
      project: { cwd: "/repo" },
      extraEnv: {
        T3CODE_PROJECT_ROOT: "/custom-root",
        CUSTOM_FLAG: "1",
      },
    });

    expect(env.T3CODE_PROJECT_ROOT).toBe("/custom-root");
    expect(env.CUSTOM_FLAG).toBe("1");
    expect(env.T3CODE_WORKTREE_PATH).toBeUndefined();
  });

  it("prefers the worktree path for script cwd resolution", () => {
    expect(
      projectScriptCwd({
        project: { cwd: "/repo" },
        worktreePath: "/repo/worktree-a",
      }),
    ).toBe("/repo/worktree-a");
    expect(
      projectScriptCwd({
        project: { cwd: "/repo" },
        worktreePath: null,
      }),
    ).toBe("/repo");
  });
});

describe("action ids across scopes", () => {
  it("avoids an id already taken in the other scope", () => {
    // ChatView feeds this the union of project scripts, project prompt
    // actions, global scripts and global prompt actions, so a fresh id is
    // unique everywhere and survives a scope move unchanged.
    expect(nextProjectScriptId("Build", ["build"])).toBe("build-2");
    expect(nextProjectScriptId("Build", ["build", "build-2"])).toBe("build-3");
  });
});

describe("withScriptUpsert", () => {
  const script = (id: string, runOnWorktreeCreate = false) => ({
    id,
    name: id,
    command: `run ${id}`,
    icon: "play" as const,
    runOnWorktreeCreate,
  });

  it("appends a script that is not in the list yet", () => {
    expect(withScriptUpsert([script("build")], script("test"))).toEqual([
      script("build"),
      script("test"),
    ]);
  });

  it("replaces a script in place, keeping its position", () => {
    const updated = { ...script("build"), command: "run build --watch" };

    expect(withScriptUpsert([script("build"), script("test")], updated)).toEqual([
      updated,
      script("test"),
    ]);
  });

  it("clears the setup flag on the other scripts in the same list", () => {
    const result = withScriptUpsert([script("old-setup", true)], script("new-setup", true));

    expect(result.map((entry) => [entry.id, entry.runOnWorktreeCreate])).toEqual([
      ["old-setup", false],
      ["new-setup", true],
    ]);
  });

  it("leaves setup flags alone when the incoming script is not a setup script", () => {
    const result = withScriptUpsert([script("setup", true)], script("build"));

    expect(result[0]?.runOnWorktreeCreate).toBe(true);
  });
});

describe("importableFileScripts", () => {
  const fileScript = { name: "Install", command: "pnpm install" };
  const script = (id: string, name: string, command: string) => ({
    id,
    name,
    command,
    icon: "play" as const,
    runOnWorktreeCreate: false,
  });

  it("hides a t3.json script the project already imported", () => {
    expect(
      importableFileScripts([fileScript], [script("install", "Install", "pnpm install")]),
    ).toEqual([]);
  });

  it("matches on the name alone, case-insensitively", () => {
    expect(
      importableFileScripts([fileScript], [script("install", "install", "something else")]),
    ).toEqual([]);
  });

  it("still offers the import when only a global action shares the name", () => {
    // Global actions live on the server, not on this project, so they must not
    // suppress a t3.json import in every project that checks in the same name.
    expect(importableFileScripts([fileScript], [])).toEqual([fileScript]);
  });
});
