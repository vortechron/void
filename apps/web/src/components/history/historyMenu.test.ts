import type { VcsCommitRef, VcsHistoryAction } from "@t3tools/contracts";
import { assert, describe, it } from "vite-plus/test";

import {
  type HistoryMenuContext,
  type HistoryMenuGroup,
  type HistoryMenuItem,
  buildHistoryMenu,
} from "./historyMenu";

const onMain: HistoryMenuContext = {
  currentRefName: "main",
  hasRemote: true,
  defaultRemoteName: "origin",
};

const localRef = (name: string, isCurrent = false): VcsCommitRef => ({
  name,
  kind: "local",
  isCurrent,
});

const remoteRef = (name: string, remoteName = "origin"): VcsCommitRef => ({
  name,
  kind: "remote",
  remoteName,
  isCurrent: false,
});

const target = (overrides: Partial<Parameters<typeof buildHistoryMenu>[0]> = {}) => ({
  commitSha: "abc1234567890",
  commitSubject: "a commit",
  refValue: null,
  isPendingRow: false,
  ...overrides,
});

function flatten(groups: ReadonlyArray<HistoryMenuGroup>): ReadonlyArray<HistoryMenuItem> {
  return groups.flatMap((group) => group.items.flatMap((item) => [item, ...(item.submenu ?? [])]));
}

function labels(groups: ReadonlyArray<HistoryMenuGroup>): ReadonlyArray<string> {
  return flatten(groups).map((item) => item.label);
}

function find(groups: ReadonlyArray<HistoryMenuGroup>, id: string): HistoryMenuItem | undefined {
  return flatten(groups).find((item) => item.id === id);
}

/** The action an item runs, unwrapping a confirmation. */
function actionOf(item: HistoryMenuItem | undefined): VcsHistoryAction | undefined {
  if (item?.action?.kind === "run") return item.action.action;
  if (item?.action?.kind === "confirm") return item.action.confirm.action;
  return undefined;
}

describe("buildHistoryMenu — local branch", () => {
  it("offers merge into the current branch, named after it", () => {
    const groups = buildHistoryMenu(target({ refValue: localRef("feature") }), onMain);

    const merge = find(groups, "branch:merge");
    assert.equal(merge?.label, "Merge into main");
    assert.deepStrictEqual(actionOf(find(groups, "branch:merge:default")), {
      _tag: "mergeRef",
      refName: "feature",
      strategy: "default",
    });
    assert.deepStrictEqual(actionOf(find(groups, "branch:merge:squash")), {
      _tag: "mergeRef",
      refName: "feature",
      strategy: "squash",
    });
  });

  it("hides checkout, merge, rebase and delete for the branch already checked out", () => {
    const groups = buildHistoryMenu(target({ refValue: localRef("main", true) }), onMain);
    const ids = flatten(groups).map((item) => item.id);

    assert.notInclude(ids, "branch:checkout");
    assert.notInclude(ids, "branch:merge");
    assert.notInclude(ids, "branch:rebase");
    assert.notInclude(ids, "branch:delete");
    assert.notInclude(ids, "branch:force-delete");
    // What is still valid on your own branch stays.
    assert.include(ids, "branch:push");
    assert.include(ids, "branch:rename");
  });

  it("pairs a force delete with a confirmation and marks it destructive", () => {
    const groups = buildHistoryMenu(target({ refValue: localRef("feature") }), onMain);
    const forceDelete = find(groups, "branch:force-delete");

    assert.isTrue(forceDelete?.destructive);
    assert.equal(forceDelete?.action?.kind, "confirm");
    assert.deepStrictEqual(actionOf(forceDelete), {
      _tag: "deleteBranch",
      refName: "feature",
      force: true,
    });
  });

  it("disables push when the repository has no remote", () => {
    const groups = buildHistoryMenu(target({ refValue: localRef("feature") }), {
      ...onMain,
      hasRemote: false,
    });
    assert.isTrue(find(groups, "branch:push")?.disabled);
  });

  it("disables rebase on a detached HEAD but leaves merge available", () => {
    const groups = buildHistoryMenu(target({ refValue: localRef("feature") }), {
      ...onMain,
      currentRefName: null,
    });

    assert.isTrue(find(groups, "branch:rebase")?.disabled);
    assert.equal(find(groups, "branch:merge")?.label, "Merge into HEAD");
    assert.notOk(find(groups, "branch:merge")?.disabled);
  });
});

describe("buildHistoryMenu — remote branch", () => {
  it("splits the remote name off before building pull and fetch", () => {
    const groups = buildHistoryMenu(target({ refValue: remoteRef("origin/feature") }), onMain);

    assert.deepStrictEqual(actionOf(find(groups, "remote:pull")), {
      _tag: "pullIntoCurrent",
      refName: "feature",
      remoteName: "origin",
    });
    assert.deepStrictEqual(actionOf(find(groups, "remote:fetch")), {
      _tag: "fetchIntoLocalBranch",
      refName: "feature",
      remoteName: "origin",
      localRefName: "feature",
    });
  });

  it("handles a remote whose name contains a slash", () => {
    const ref = remoteRef("my/fork/feature", "my/fork");
    const groups = buildHistoryMenu(target({ refValue: ref }), onMain);

    assert.deepStrictEqual(actionOf(find(groups, "remote:pull")), {
      _tag: "pullIntoCurrent",
      refName: "feature",
      remoteName: "my/fork",
    });
  });

  it("disables fetch-into-local when that branch is the one checked out", () => {
    const groups = buildHistoryMenu(target({ refValue: remoteRef("origin/main") }), onMain);
    assert.isTrue(find(groups, "remote:fetch")?.disabled);
  });

  it("confirms before deleting a branch on the remote", () => {
    const groups = buildHistoryMenu(target({ refValue: remoteRef("origin/feature") }), onMain);
    const remove = find(groups, "remote:delete");

    assert.isTrue(remove?.destructive);
    assert.equal(remove?.action?.kind, "confirm");
    assert.deepStrictEqual(actionOf(remove), {
      _tag: "deleteRemoteBranch",
      refName: "feature",
      remoteName: "origin",
    });
  });
});

describe("buildHistoryMenu — tags and stashes", () => {
  it("offers push and both deletes for a tag", () => {
    const groups = buildHistoryMenu(
      target({ refValue: { name: "v1.0.0", kind: "tag", isCurrent: false } }),
      onMain,
    );

    assert.deepStrictEqual(actionOf(find(groups, "tag:push")), {
      _tag: "pushTag",
      tagName: "v1.0.0",
    });
    assert.deepStrictEqual(actionOf(find(groups, "tag:delete")), {
      _tag: "deleteTag",
      tagName: "v1.0.0",
    });
    assert.deepStrictEqual(actionOf(find(groups, "tag:delete-everywhere")), {
      _tag: "deleteTag",
      tagName: "v1.0.0",
      remoteName: "origin",
    });
  });

  it("replaces the commit menu for a stash, which cannot be tagged or rebased onto", () => {
    const groups = buildHistoryMenu(
      target({ refValue: { name: "stash@{0}", kind: "stash", isCurrent: false } }),
      onMain,
    );
    const ids = flatten(groups).map((item) => item.id);

    assert.include(ids, "stash:apply");
    assert.include(ids, "stash:pop");
    assert.include(ids, "stash:drop");
    assert.notInclude(ids, "commit:tag");
    assert.notInclude(ids, "commit:rebase");
    // Copying the SHA is still useful.
    assert.include(ids, "copy:sha");
  });
});

describe("buildHistoryMenu — commits", () => {
  it("offers the full commit verb set", () => {
    const groups = buildHistoryMenu(target(), onMain);
    const ids = flatten(groups).map((item) => item.id);

    for (const id of [
      "commit:branch",
      "commit:tag",
      "commit:checkout",
      "commit:merge",
      "commit:rebase",
      "commit:cherry-pick",
      "commit:revert",
      "commit:reset",
      "commit:drop",
    ]) {
      assert.include(ids, id, `expected ${id}`);
    }
  });

  it("confirms only the hard reset", () => {
    const groups = buildHistoryMenu(target(), onMain);

    assert.equal(find(groups, "commit:reset:soft")?.action?.kind, "run");
    assert.equal(find(groups, "commit:reset:mixed")?.action?.kind, "run");
    assert.equal(find(groups, "commit:reset:hard")?.action?.kind, "confirm");
    assert.isTrue(find(groups, "commit:reset:hard")?.destructive);
  });

  it("shows no ref group when the row rather than a badge was clicked", () => {
    const groups = buildHistoryMenu(target(), onMain);
    assert.deepStrictEqual(
      groups.map((group) => group.id),
      ["commit", "copy"],
    );
  });

  it("skips the ref group for the HEAD badge, which has nothing of its own", () => {
    const groups = buildHistoryMenu(
      target({ refValue: { name: "HEAD", kind: "head", isCurrent: true } }),
      onMain,
    );
    assert.deepStrictEqual(
      groups.map((group) => group.id),
      ["commit", "copy"],
    );
  });
});

describe("buildHistoryMenu — uncommitted changes", () => {
  it("offers only working-tree verbs and confirms the destructive ones", () => {
    const groups = buildHistoryMenu(target({ isPendingRow: true }), onMain);

    assert.deepStrictEqual(labels(groups), [
      "Stash uncommitted changes...",
      "Reset uncommitted changes",
      "Mixed — unstage, keep edits",
      "Hard — discard all edits",
      "Clean untracked files",
    ]);
    assert.equal(find(groups, "pending:reset:mixed")?.action?.kind, "run");
    assert.equal(find(groups, "pending:reset:hard")?.action?.kind, "confirm");
    assert.equal(find(groups, "pending:clean")?.action?.kind, "confirm");
  });

  it("stashes untracked files too, and treats the description as optional", () => {
    const groups = buildHistoryMenu(target({ isPendingRow: true }), onMain);
    const stash = find(groups, "pending:stash");

    assert.equal(stash?.action?.kind, "prompt");
    if (stash?.action?.kind !== "prompt") return;
    assert.isTrue(stash.action.prompt.optional);
    assert.deepStrictEqual(stash.action.prompt.build(""), {
      _tag: "stashPush",
      includeUntracked: true,
    });
    assert.deepStrictEqual(stash.action.prompt.build("wip"), {
      _tag: "stashPush",
      includeUntracked: true,
      message: "wip",
    });
  });
});

describe("buildHistoryMenu — safety", () => {
  it("gives every destructive entry a confirmation", () => {
    const targets = [
      target({ refValue: localRef("feature") }),
      target({ refValue: remoteRef("origin/feature") }),
      target({ refValue: { name: "v1", kind: "tag", isCurrent: false } }),
      target({ refValue: { name: "stash@{0}", kind: "stash", isCurrent: false } }),
      target(),
      target({ isPendingRow: true }),
    ];

    for (const item of targets.flatMap((value) => flatten(buildHistoryMenu(value, onMain)))) {
      if (!item.destructive) continue;
      assert.equal(item.action?.kind, "confirm", `${item.id} must confirm before running`);
    }
  });
});
