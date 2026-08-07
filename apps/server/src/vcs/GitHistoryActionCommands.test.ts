import { assert, describe, it } from "@effect/vitest";

import { buildHistoryCommand } from "./GitHistoryActionCommands.ts";

const noRemote = { remoteName: null };

describe("buildHistoryCommand", () => {
  it("merges a ref with --no-edit so no editor blocks the server", () => {
    const command = buildHistoryCommand({ _tag: "mergeRef", refName: "feature" }, noRemote);
    assert.deepStrictEqual(command.steps, [["merge", "--no-edit", "feature", "--"]]);
    assert.equal(command.changesHead, false);
  });

  it("passes --no-ff and --squash through as merge strategies", () => {
    assert.deepStrictEqual(
      buildHistoryCommand(
        { _tag: "mergeRef", refName: "feature", strategy: "no-fast-forward" },
        noRemote,
      ).steps,
      [["merge", "--no-ff", "--no-edit", "feature", "--"]],
    );
    assert.deepStrictEqual(
      buildHistoryCommand({ _tag: "mergeRef", refName: "feature", strategy: "squash" }, noRemote)
        .steps,
      [["merge", "--squash", "feature", "--"]],
    );
  });

  it("drops a commit by rebasing the range that follows it", () => {
    assert.deepStrictEqual(
      buildHistoryCommand({ _tag: "dropCommit", commitSha: "abc123" }, noRemote).steps,
      [["rebase", "--onto", "abc123^", "abc123", "--"]],
    );
  });

  it("uses -d for a safe branch delete and -D only when forced", () => {
    assert.deepStrictEqual(
      buildHistoryCommand({ _tag: "deleteBranch", refName: "old" }, noRemote).steps,
      [["branch", "-d", "--", "old"]],
    );
    assert.deepStrictEqual(
      buildHistoryCommand({ _tag: "deleteBranch", refName: "old", force: true }, noRemote).steps,
      [["branch", "-D", "--", "old"]],
    );
  });

  it("never force-pushes without a lease", () => {
    const command = buildHistoryCommand(
      { _tag: "pushBranch", refName: "feature", force: true },
      { remoteName: "upstream" },
    );
    assert.deepStrictEqual(command.steps, [
      ["push", "--force-with-lease", "upstream", "refs/heads/feature:refs/heads/feature"],
    ]);
    assert.isFalse(command.steps[0]?.includes("--force"));
  });

  it("falls back to the resolved primary remote when none is given", () => {
    assert.deepStrictEqual(
      buildHistoryCommand({ _tag: "pushTag", tagName: "v1" }, { remoteName: "upstream" }).steps,
      [["push", "upstream", "refs/tags/v1"]],
    );
    assert.deepStrictEqual(
      buildHistoryCommand({ _tag: "pushTag", tagName: "v1" }, noRemote).steps,
      [["push", "origin", "refs/tags/v1"]],
    );
  });

  it("fetches a remote branch into a local one without checking it out", () => {
    assert.deepStrictEqual(
      buildHistoryCommand(
        {
          _tag: "fetchIntoLocalBranch",
          refName: "main",
          remoteName: "origin",
          localRefName: "main",
        },
        noRemote,
      ).steps,
      [["fetch", "origin", "main:main"]],
    );
  });

  it("deletes a tag locally and on the remote as two ordered steps", () => {
    const command = buildHistoryCommand(
      { _tag: "deleteTag", tagName: "v1", remoteName: "origin" },
      noRemote,
    );
    assert.deepStrictEqual(command.steps, [
      ["tag", "-d", "v1"],
      ["push", "origin", "--delete", "refs/tags/v1"],
    ]);
  });

  it("creates an annotated tag only when a message is supplied", () => {
    assert.deepStrictEqual(
      buildHistoryCommand({ _tag: "createTag", tagName: "v1", commitSha: "abc" }, noRemote).steps,
      [["tag", "v1", "abc"]],
    );
    assert.deepStrictEqual(
      buildHistoryCommand(
        { _tag: "createTag", tagName: "v1", commitSha: "abc", message: "ship it" },
        noRemote,
      ).steps,
      [["tag", "-a", "-m", "ship it", "v1", "abc"]],
    );
  });

  it("reports changesHead only for actions that move the checkout", () => {
    const changes = (action: Parameters<typeof buildHistoryCommand>[0]) =>
      buildHistoryCommand(action, noRemote).changesHead;

    assert.isTrue(changes({ _tag: "checkoutDetached", commitSha: "abc" }));
    assert.isTrue(changes({ _tag: "stashBranch", stashRef: "stash@{0}", refName: "wip" }));
    assert.isTrue(
      changes({ _tag: "createBranchAt", commitSha: "abc", refName: "x", checkout: true }),
    );
    assert.isFalse(changes({ _tag: "createBranchAt", commitSha: "abc", refName: "x" }));
    assert.isFalse(changes({ _tag: "resetTo", commitSha: "abc", mode: "hard" }));
  });
});
