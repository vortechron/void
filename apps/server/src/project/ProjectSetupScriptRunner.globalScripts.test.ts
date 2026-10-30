import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import { assert, it, vi } from "@effect/vitest";
import { ProjectId, type ProjectScript } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import * as TerminalManager from "../terminal/Manager.ts";
import * as ServerSettings from "../serverSettings.ts";
import * as ProjectionStore from "../orchestration-v2/ProjectionStore.ts";
import * as ProjectService from "./ProjectService.ts";
import * as ProjectSetupScriptRunner from "./ProjectSetupScriptRunner.ts";

// Void: global actions from settings.json run as setup scripts too, and a
// project's own setup script shadows the global one.

const projectId = ProjectId.make("project:global-setup");

const globalSetup: ProjectScript = {
  id: "global-setup",
  name: "Global setup",
  command: "pnpm install",
  icon: "configure",
  runOnWorktreeCreate: true,
};

const projectSetup: ProjectScript = {
  id: "setup",
  name: "Setup",
  command: "bun install",
  icon: "configure",
  runOnWorktreeCreate: true,
};

function makeHarness(scripts: ReadonlyArray<ProjectScript>) {
  const open = vi.fn((input: Parameters<TerminalManager.TerminalManager["Service"]["open"]>[0]) =>
    Effect.succeed({
      threadId: input.threadId,
      terminalId: input.terminalId,
      cwd: input.cwd,
      worktreePath: input.worktreePath ?? null,
      status: "running" as const,
      pid: 123,
      history: "",
      exitCode: null,
      exitSignal: null,
      label: "Shell",
      updatedAt: "2026-06-20T00:00:00.000Z",
    }),
  );
  const write = vi.fn(
    (_input: Parameters<TerminalManager.TerminalManager["Service"]["write"]>[0]) => Effect.void,
  );
  const subscribe: TerminalManager.TerminalManager["Service"]["subscribe"] = () =>
    Effect.succeed(() => undefined);
  const project = {
    id: projectId,
    title: "Project",
    workspaceRoot: "/repo",
    repositoryIdentity: null,
    faviconPath: null,
    defaultModelSelection: null,
    scripts,
    createdAt: "2026-06-20T00:00:00.000Z",
    updatedAt: "2026-06-20T00:00:00.000Z",
    deletedAt: null,
  };
  const layer = ProjectSetupScriptRunner.layer.pipe(
    Layer.provide(
      Layer.mergeAll(
        Layer.mock(ProjectService.ProjectService)({
          getById: () => Effect.succeedSome(project),
        }),
        Layer.mock(ProjectionStore.ProjectionStoreV2)({
          getThreadShell: () => Effect.succeed(null),
        }),
        Layer.mock(TerminalManager.TerminalManager)({ open, write, subscribe }),
        ServerSettings.layerTest({ globalScripts: [globalSetup] }),
        NodeCrypto.layer,
      ),
    ),
  );
  return { layer };
}

it.effect("runs a global setup script when the project declares none", () => {
  const { layer } = makeHarness([]);
  return Effect.gen(function* () {
    const runner = yield* ProjectSetupScriptRunner.ProjectSetupScriptRunner;
    const result = yield* runner.runForThread({
      threadId: "thread-1",
      projectId,
      worktreePath: "/repo/worktrees/a",
    });
    assert.equal(result.status, "started");
    if (result.status === "started") {
      assert.equal(result.scriptId, "global-setup");
      assert.equal(result.scriptName, "Global setup");
    }
  }).pipe(Effect.provide(layer));
});

it.effect("lets the project's own setup script shadow the global one", () => {
  const { layer } = makeHarness([projectSetup]);
  return Effect.gen(function* () {
    const runner = yield* ProjectSetupScriptRunner.ProjectSetupScriptRunner;
    const result = yield* runner.runForThread({
      threadId: "thread-1",
      projectId,
      worktreePath: "/repo/worktrees/a",
    });
    assert.equal(result.status, "started");
    if (result.status === "started") {
      assert.equal(result.scriptId, "setup");
    }
  }).pipe(Effect.provide(layer));
});
