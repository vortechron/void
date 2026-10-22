import { shortcutLabelForCommand } from "./keybindings";
import { describe, expect, it } from "vite-plus/test";
import { settleProjectScript, setupProjectScript } from "@t3tools/shared/projectScripts";

import {
  commandForProjectScript,
  importableFileScripts,
  nextProjectScriptId,
  primaryProjectScript,
  projectScriptIdFromCommand,
  withScriptUpsert,
  releaseClaimedRoles,
} from "./projectScripts";

describe("projectScripts helpers", () => {
  it.each(["install-javascript-dependencies", "A", "a.b", "a b", "-a", "", "a".repeat(25)])(
    "omits the shortcut for legacy script ID %j without crashing script menus",
    (id) => {
      const commands = ["lint", id, "test"].map(commandForProjectScript);
      expect(commands).toEqual(["script.lint.run", null, "script.test.run"]);
      expect(commands.map((command) => shortcutLabelForCommand([], command))).toEqual([
        null,
        null,
        null,
      ]);
    },
  );

  it("slugifies and dedupes project script ids", () => {
    expect(nextProjectScriptId("Run Tests", [])).toBe("run-tests");
    expect(nextProjectScriptId("Run Tests", ["run-tests"])).toBe("run-tests-2");
    expect(nextProjectScriptId("!!!", [])).toBe("script");
  });

  it("resolves primary, setup, and settle scripts", () => {
    const scripts = [
      {
        id: "setup",
        name: "Setup",
        command: "bun install",
        icon: "configure" as const,
        runOnWorktreeCreate: true,
      },
      {
        id: "clean",
        name: "Clean",
        command: "cargo clean",
        icon: "build" as const,
        runOnWorktreeCreate: false,
        runOnSettle: true,
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
    expect(settleProjectScript(scripts)?.id).toBe("clean");
    expect(primaryProjectScript(scripts.filter((script) => script.id === "clean"))).toBeNull();
  });

  it("moves the setup and settle roles to the script that claims them", () => {
    const input = {
      name: "Next",
      command: "true",
      icon: "play",
      waitForSetup: false,
      previewUrl: null,
      autoOpenPreview: false,
    } as const;
    const holder = {
      id: "holder",
      name: "Holder",
      command: "true",
      icon: "play" as const,
      runOnWorktreeCreate: true,
      runOnSettle: true,
    };

    expect(
      releaseClaimedRoles(holder, { ...input, runOnWorktreeCreate: false, runOnSettle: true }),
    ).toMatchObject({ runOnWorktreeCreate: true, runOnSettle: false });
    expect(
      releaseClaimedRoles(holder, { ...input, runOnWorktreeCreate: true, runOnSettle: false }),
    ).toMatchObject({ runOnWorktreeCreate: false, runOnSettle: true });
    expect(
      releaseClaimedRoles(holder, { ...input, runOnWorktreeCreate: false, runOnSettle: false }),
    ).toBe(holder);
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
