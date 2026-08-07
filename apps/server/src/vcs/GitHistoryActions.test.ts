import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";

import type { GitCommandError } from "@t3tools/contracts";
import { ServerConfig } from "../config.ts";
import * as GitVcsDriver from "./GitVcsDriver.ts";
import { parseStashList } from "./GitHistoryActions.ts";
import { parseTrackedDirtyPaths } from "./GitHistoryActionGuards.ts";

const ServerConfigLayer = ServerConfig.layerTest(process.cwd(), {
  prefix: "t3-git-history-actions-test-",
});
const TestLayer = GitVcsDriver.layer.pipe(
  Layer.provide(ServerConfigLayer),
  Layer.provideMerge(NodeServices.layer),
);

const NUL = "\0";

const git = (cwd: string, args: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const driver = yield* GitVcsDriver.GitVcsDriver;
    const result = yield* driver.execute({
      operation: "GitHistoryActions.test.git",
      cwd,
      args,
      timeoutMs: 15_000,
      allowNonZeroExit: true,
    });
    return result.stdout.trim();
  });

const writeFile = (cwd: string, name: string, contents: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    yield* fs.writeFileString(path.join(cwd, name), contents);
  });

/** A repo on `main` with one commit, plus a `feature` branch one commit ahead. */
const makeRepo = Effect.fn("makeRepo")(function* (
  options: { readonly conflicting?: boolean } = {},
) {
  const fs = yield* FileSystem.FileSystem;
  const cwd = yield* fs.makeTempDirectoryScoped({ prefix: "git-history-actions-" });
  yield* git(cwd, ["init", "-b", "main"]);
  yield* git(cwd, ["config", "user.email", "test@test.com"]);
  yield* git(cwd, ["config", "user.name", "Test"]);
  yield* git(cwd, ["config", "commit.gpgsign", "false"]);
  yield* writeFile(cwd, "shared.txt", "base\n");
  yield* git(cwd, ["add", "."]);
  yield* git(cwd, ["commit", "-m", "initial"]);

  yield* git(cwd, ["checkout", "-b", "feature"]);
  yield* writeFile(cwd, "shared.txt", "from-feature\n");
  yield* git(cwd, ["add", "."]);
  yield* git(cwd, ["commit", "-m", "feature change"]);

  yield* git(cwd, ["checkout", "main"]);
  if (options.conflicting) {
    // Touches the same line so a merge cannot resolve itself.
    yield* writeFile(cwd, "shared.txt", "from-main\n");
    yield* git(cwd, ["add", "."]);
    yield* git(cwd, ["commit", "-m", "main change"]);
  }
  return cwd;
});

/**
 * Porcelain status keeps its leading XY column, so only the trailing newline is
 * stripped — ` M file` and `M  file` mean different things.
 */
const statusOf = (cwd: string) =>
  Effect.gen(function* () {
    const driver = yield* GitVcsDriver.GitVcsDriver;
    const result = yield* driver.execute({
      operation: "GitHistoryActions.test.status",
      cwd,
      args: ["status", "--porcelain"],
      timeoutMs: 15_000,
      allowNonZeroExit: true,
    });
    return result.stdout.replace(/\n+$/, "");
  });

describe("parseTrackedDirtyPaths", () => {
  it("ignores untracked and ignored entries", () => {
    assert.deepStrictEqual(
      parseTrackedDirtyPaths(" M src/a.ts\n?? build/out.js\n!! .env\nA  src/b.ts\n"),
      ["src/a.ts", "src/b.ts"],
    );
  });

  it("reports the destination path of a rename", () => {
    assert.deepStrictEqual(parseTrackedDirtyPaths("R  old.ts -> new.ts\n"), ["new.ts"]);
  });

  it("treats a clean tree as empty", () => {
    assert.deepStrictEqual(parseTrackedDirtyPaths(""), []);
  });
});

describe("parseStashList", () => {
  it("splits the reflog subject into branch and message", () => {
    const line = [
      "abc123def456",
      "abc123d",
      "parent1 parent2 parent3",
      "stash@{0}",
      "2026-08-07T10:00:00+00:00",
      "WIP on main: 1234567 earlier subject",
    ].join(NUL);

    const [entry] = parseStashList(line);
    assert.equal(entry?.ref, "stash@{0}");
    assert.equal(entry?.branchName, "main");
    assert.equal(entry?.message, "1234567 earlier subject");
    // Only the first parent is the commit the stash sits on.
    assert.equal(entry?.baseSha, "parent1");
  });

  it("keeps a message containing the field separator intact", () => {
    const line = [
      "sha",
      "sh",
      "p1",
      "stash@{0}",
      "2026-08-07T10:00:00+00:00",
      `On main: a${NUL}b`,
    ].join(NUL);
    assert.equal(parseStashList(line)[0]?.message, `a${NUL}b`);
  });

  it("drops malformed records instead of failing the list", () => {
    assert.deepStrictEqual(parseStashList("garbage\n\n"), []);
  });
});

describe("runHistoryAction", () => {
  it.effect("merges another branch into the current one", () =>
    Effect.gen(function* () {
      const driver = yield* GitVcsDriver.GitVcsDriver;
      const cwd = yield* makeRepo();

      const result = yield* driver.runHistoryAction({
        cwd,
        action: { _tag: "mergeRef", refName: "feature" },
      });

      assert.equal(result._tag, "ok");
      assert.equal(yield* git(cwd, ["branch", "--show-current"]), "main");
      const contents = yield* git(cwd, ["show", "HEAD:shared.txt"]);
      assert.equal(contents, "from-feature");
    }).pipe(Effect.provide(TestLayer), Effect.scoped),
  );

  it.effect("rolls a conflicting merge back so the tree is left clean", () =>
    Effect.gen(function* () {
      const driver = yield* GitVcsDriver.GitVcsDriver;
      const cwd = yield* makeRepo({ conflicting: true });
      const headBefore = yield* git(cwd, ["rev-parse", "HEAD"]);

      const result = yield* driver.runHistoryAction({
        cwd,
        action: { _tag: "mergeRef", refName: "feature" },
      });

      assert.equal(result._tag, "conflicted");
      if (result._tag !== "conflicted") return;
      assert.equal(result.source, "merge");
      assert.isTrue(result.rolledBack);
      assert.deepStrictEqual([...result.paths], ["shared.txt"]);

      // The repository must be exactly where it started.
      assert.equal(yield* git(cwd, ["rev-parse", "HEAD"]), headBefore);
      assert.equal(yield* statusOf(cwd), "");
      assert.equal(yield* git(cwd, ["rev-parse", "--verify", "--quiet", "MERGE_HEAD"]), "");
    }).pipe(Effect.provide(TestLayer), Effect.scoped),
  );

  it.effect("refuses to merge over uncommitted tracked changes", () =>
    Effect.gen(function* () {
      const driver = yield* GitVcsDriver.GitVcsDriver;
      const cwd = yield* makeRepo();
      yield* writeFile(cwd, "shared.txt", "local edit\n");

      const result = yield* driver.runHistoryAction({
        cwd,
        action: { _tag: "mergeRef", refName: "feature" },
      });

      assert.equal(result._tag, "blocked");
      if (result._tag !== "blocked") return;
      assert.equal(result.reason, "dirty-working-tree");
      assert.include(result.detail, "shared.txt");
      // The edit is still there — a refusal never discards work.
      assert.equal(yield* statusOf(cwd), " M shared.txt");
    }).pipe(Effect.provide(TestLayer), Effect.scoped),
  );

  it.effect("allows a merge when only untracked files are present", () =>
    Effect.gen(function* () {
      const driver = yield* GitVcsDriver.GitVcsDriver;
      const cwd = yield* makeRepo();
      yield* writeFile(cwd, "scratch.log", "ignore me\n");

      const result = yield* driver.runHistoryAction({
        cwd,
        action: { _tag: "mergeRef", refName: "feature" },
      });

      assert.equal(result._tag, "ok");
    }).pipe(Effect.provide(TestLayer), Effect.scoped),
  );

  it.effect("refuses to delete the branch that is checked out", () =>
    Effect.gen(function* () {
      const driver = yield* GitVcsDriver.GitVcsDriver;
      const cwd = yield* makeRepo();

      const result = yield* driver.runHistoryAction({
        cwd,
        action: { _tag: "deleteBranch", refName: "main" },
      });

      assert.equal(result._tag, "blocked");
      if (result._tag !== "blocked") return;
      assert.equal(result.reason, "current-branch");
    }).pipe(Effect.provide(TestLayer), Effect.scoped),
  );

  it.effect("reports an unmerged branch delete as recoverable rather than failing", () =>
    Effect.gen(function* () {
      const driver = yield* GitVcsDriver.GitVcsDriver;
      const cwd = yield* makeRepo();

      const result = yield* driver.runHistoryAction({
        cwd,
        action: { _tag: "deleteBranch", refName: "feature" },
      });

      assert.equal(result._tag, "blocked");
      if (result._tag !== "blocked") return;
      assert.equal(result.reason, "unsupported");
      assert.include(result.detail, "Force delete");

      const forced = yield* driver.runHistoryAction({
        cwd,
        action: { _tag: "deleteBranch", refName: "feature", force: true },
      });
      assert.equal(forced._tag, "ok");
      assert.equal(yield* git(cwd, ["branch", "--list", "feature"]), "");
    }).pipe(Effect.provide(TestLayer), Effect.scoped),
  );

  it.effect("blocks every action while a merge is already in progress", () =>
    Effect.gen(function* () {
      const driver = yield* GitVcsDriver.GitVcsDriver;
      const cwd = yield* makeRepo({ conflicting: true });
      // Leave a real conflict in place, bypassing the guarded path.
      yield* git(cwd, ["merge", "feature"]);
      assert.notEqual(yield* git(cwd, ["rev-parse", "--verify", "--quiet", "MERGE_HEAD"]), "");

      const result = yield* driver.runHistoryAction({
        cwd,
        action: { _tag: "cherryPick", commitSha: "HEAD" },
      });

      assert.equal(result._tag, "blocked");
      if (result._tag !== "blocked") return;
      assert.equal(result.reason, "operation-in-progress");
      assert.include(result.detail, "merge");
    }).pipe(Effect.provide(TestLayer), Effect.scoped),
  );

  it.effect("rolls a conflicting cherry-pick back", () =>
    Effect.gen(function* () {
      const driver = yield* GitVcsDriver.GitVcsDriver;
      const cwd = yield* makeRepo({ conflicting: true });
      const featureSha = yield* git(cwd, ["rev-parse", "feature"]);
      const headBefore = yield* git(cwd, ["rev-parse", "HEAD"]);

      const result = yield* driver.runHistoryAction({
        cwd,
        action: { _tag: "cherryPick", commitSha: featureSha },
      });

      assert.equal(result._tag, "conflicted");
      if (result._tag !== "conflicted") return;
      assert.equal(result.source, "cherry-pick");
      assert.isTrue(result.rolledBack);
      assert.equal(yield* git(cwd, ["rev-parse", "HEAD"]), headBefore);
      assert.equal(yield* statusOf(cwd), "");
    }).pipe(Effect.provide(TestLayer), Effect.scoped),
  );

  it.effect("reverts a commit and leaves the working tree clean", () =>
    Effect.gen(function* () {
      const driver = yield* GitVcsDriver.GitVcsDriver;
      const cwd = yield* makeRepo();
      yield* git(cwd, ["merge", "--no-edit", "feature"]);
      const merged = yield* git(cwd, ["rev-parse", "HEAD"]);

      const result = yield* driver.runHistoryAction({
        cwd,
        action: { _tag: "revertCommit", commitSha: merged, parentNumber: 1 },
      });

      assert.equal(result._tag, "ok");
      assert.equal(yield* statusOf(cwd), "");
      assert.equal(yield* git(cwd, ["show", "HEAD:shared.txt"]), "base");
    }).pipe(Effect.provide(TestLayer), Effect.scoped),
  );

  it.effect("creates a branch at a commit and optionally checks it out", () =>
    Effect.gen(function* () {
      const driver = yield* GitVcsDriver.GitVcsDriver;
      const cwd = yield* makeRepo();
      const featureSha = yield* git(cwd, ["rev-parse", "feature"]);

      const result = yield* driver.runHistoryAction({
        cwd,
        action: {
          _tag: "createBranchAt",
          commitSha: featureSha,
          refName: "hotfix",
          checkout: true,
        },
      });

      assert.equal(result._tag, "ok");
      if (result._tag !== "ok") return;
      assert.equal(result.refName, "hotfix");
      assert.equal(yield* git(cwd, ["branch", "--show-current"]), "hotfix");
    }).pipe(Effect.provide(TestLayer), Effect.scoped),
  );

  it.effect("refuses to create a branch whose name is taken", () =>
    Effect.gen(function* () {
      const driver = yield* GitVcsDriver.GitVcsDriver;
      const cwd = yield* makeRepo();

      const result = yield* driver.runHistoryAction({
        cwd,
        action: { _tag: "createBranchAt", commitSha: "HEAD", refName: "feature" },
      });

      assert.equal(result._tag, "blocked");
      if (result._tag !== "blocked") return;
      assert.equal(result.reason, "ref-exists");
    }).pipe(Effect.provide(TestLayer), Effect.scoped),
  );

  it.effect("resets the current branch to an earlier commit", () =>
    Effect.gen(function* () {
      const driver = yield* GitVcsDriver.GitVcsDriver;
      const cwd = yield* makeRepo({ conflicting: true });
      const first = yield* git(cwd, ["rev-parse", "HEAD~1"]);

      const result = yield* driver.runHistoryAction({
        cwd,
        action: { _tag: "resetTo", commitSha: first, mode: "hard" },
      });

      assert.equal(result._tag, "ok");
      assert.equal(yield* git(cwd, ["rev-parse", "HEAD"]), first);
      assert.equal(yield* statusOf(cwd), "");
    }).pipe(Effect.provide(TestLayer), Effect.scoped),
  );

  it.effect("tags a commit and deletes the tag again", () =>
    Effect.gen(function* () {
      const driver = yield* GitVcsDriver.GitVcsDriver;
      const cwd = yield* makeRepo();

      const created = yield* driver.runHistoryAction({
        cwd,
        action: { _tag: "createTag", commitSha: "HEAD", tagName: "v1.0.0", message: "first" },
      });
      assert.equal(created._tag, "ok");
      assert.equal(yield* git(cwd, ["tag", "--list", "v1.0.0"]), "v1.0.0");

      const deleted = yield* driver.runHistoryAction({
        cwd,
        action: { _tag: "deleteTag", tagName: "v1.0.0" },
      });
      assert.equal(deleted._tag, "ok");
      assert.equal(yield* git(cwd, ["tag", "--list", "v1.0.0"]), "");
    }).pipe(Effect.provide(TestLayer), Effect.scoped),
  );

  it.effect("stashes, lists, and pops a change", () =>
    Effect.gen(function* () {
      const driver = yield* GitVcsDriver.GitVcsDriver;
      const cwd = yield* makeRepo();
      yield* writeFile(cwd, "shared.txt", "work in progress\n");

      const stashed = yield* driver.runHistoryAction({
        cwd,
        action: { _tag: "stashPush", message: "wip" },
      });
      assert.equal(stashed._tag, "ok");
      assert.equal(yield* statusOf(cwd), "");

      const listed = yield* driver.listStashes({ cwd });
      assert.equal(listed.isRepo, true);
      assert.equal(listed.stashes.length, 1);
      assert.equal(listed.stashes[0]?.ref, "stash@{0}");
      assert.equal(listed.stashes[0]?.branchName, "main");
      assert.equal(listed.stashes[0]?.message, "wip");

      const popped = yield* driver.runHistoryAction({
        cwd,
        action: { _tag: "stashPop", stashRef: "stash@{0}" },
      });
      assert.equal(popped._tag, "ok");
      assert.equal(yield* statusOf(cwd), " M shared.txt");
      assert.equal((yield* driver.listStashes({ cwd })).stashes.length, 0);
    }).pipe(Effect.provide(TestLayer), Effect.scoped),
  );

  it.effect("refuses to stash when nothing is changed", () =>
    Effect.gen(function* () {
      const driver = yield* GitVcsDriver.GitVcsDriver;
      const cwd = yield* makeRepo();

      const result = yield* driver.runHistoryAction({ cwd, action: { _tag: "stashPush" } });

      assert.equal(result._tag, "blocked");
      if (result._tag !== "blocked") return;
      assert.equal(result.reason, "dirty-working-tree");
    }).pipe(Effect.provide(TestLayer), Effect.scoped),
  );

  it.effect("cleans untracked files only when asked", () =>
    Effect.gen(function* () {
      const driver = yield* GitVcsDriver.GitVcsDriver;
      const cwd = yield* makeRepo();
      yield* writeFile(cwd, "scratch.log", "junk\n");

      const result = yield* driver.runHistoryAction({ cwd, action: { _tag: "cleanUntracked" } });

      assert.equal(result._tag, "ok");
      assert.equal(yield* statusOf(cwd), "");
    }).pipe(Effect.provide(TestLayer), Effect.scoped),
  );

  it.effect("rebases the current branch onto another", () =>
    Effect.gen(function* () {
      const driver = yield* GitVcsDriver.GitVcsDriver;
      const cwd = yield* makeRepo();
      // A commit that does not collide with feature's change.
      yield* writeFile(cwd, "main-only.txt", "main\n");
      yield* git(cwd, ["add", "."]);
      yield* git(cwd, ["commit", "-m", "main only"]);

      const result = yield* driver.runHistoryAction({
        cwd,
        action: { _tag: "rebaseOnto", refName: "feature" },
      });

      assert.equal(result._tag, "ok");
      assert.equal(yield* git(cwd, ["branch", "--show-current"]), "main");
      const ancestry = yield* git(cwd, ["rev-list", "--count", "HEAD"]);
      assert.equal(ancestry, "3");
    }).pipe(Effect.provide(TestLayer), Effect.scoped),
  );

  it.effect("rolls a conflicting rebase back to the original branch tip", () =>
    Effect.gen(function* () {
      const driver = yield* GitVcsDriver.GitVcsDriver;
      const cwd = yield* makeRepo({ conflicting: true });
      const headBefore = yield* git(cwd, ["rev-parse", "HEAD"]);

      const result = yield* driver.runHistoryAction({
        cwd,
        action: { _tag: "rebaseOnto", refName: "feature" },
      });

      assert.equal(result._tag, "conflicted");
      if (result._tag !== "conflicted") return;
      assert.equal(result.source, "rebase");
      assert.isTrue(result.rolledBack);
      assert.equal(yield* git(cwd, ["rev-parse", "HEAD"]), headBefore);
      assert.equal(yield* git(cwd, ["branch", "--show-current"]), "main");
      assert.equal(yield* statusOf(cwd), "");
    }).pipe(Effect.provide(TestLayer), Effect.scoped),
  );

  it.effect("reports a missing repository instead of running anything", () =>
    Effect.gen(function* () {
      const driver = yield* GitVcsDriver.GitVcsDriver;
      const fs = yield* FileSystem.FileSystem;
      const cwd = yield* fs.makeTempDirectoryScoped({ prefix: "git-history-not-a-repo-" });

      const result = yield* driver.runHistoryAction({
        cwd,
        action: { _tag: "mergeRef", refName: "feature" },
      });

      assert.equal(result._tag, "blocked");
      if (result._tag !== "blocked") return;
      assert.equal(result.reason, "not-a-repo");
    }).pipe(Effect.provide(TestLayer), Effect.scoped),
  );
});
