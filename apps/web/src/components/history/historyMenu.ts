/**
 * The commit-graph context menus, as data.
 *
 * Which entries appear depends on what was right-clicked and on the state of
 * the repository, and that combination is where these menus go wrong — offering
 * "delete" for the branch you are on, or "pull" with no remote. Building the
 * menu as a pure value keeps every one of those rules under unit test instead
 * of behind a right-click.
 *
 * The entry set follows the VS Code Git Graph context menus.
 */
import type { VcsCommitRef, VcsHistoryAction, VcsResetMode } from "@t3tools/contracts";

import { splitRemoteRefName } from "./historyRows";

export interface HistoryPrompt {
  readonly title: string;
  readonly label: string;
  readonly placeholder: string;
  readonly initialValue: string;
  readonly confirmLabel: string;
  /** When true the action can run with an empty value. */
  readonly optional?: boolean;
  /** Builds the action once the user supplies a value. */
  readonly build: (value: string) => VcsHistoryAction;
}

export interface HistoryConfirm {
  readonly title: string;
  readonly body: string;
  readonly confirmLabel: string;
  readonly action: VcsHistoryAction;
}

export type HistoryMenuAction =
  | { readonly kind: "run"; readonly action: VcsHistoryAction }
  | { readonly kind: "confirm"; readonly confirm: HistoryConfirm }
  | { readonly kind: "prompt"; readonly prompt: HistoryPrompt }
  | { readonly kind: "checkout"; readonly refName: string }
  | { readonly kind: "copy"; readonly value: string; readonly label: string };

export interface HistoryMenuItem {
  readonly id: string;
  readonly label: string;
  readonly action?: HistoryMenuAction;
  readonly submenu?: ReadonlyArray<HistoryMenuItem>;
  readonly disabled?: boolean;
  /** Renders in the destructive colour. Always paired with a confirmation. */
  readonly destructive?: boolean;
}

export interface HistoryMenuGroup {
  readonly id: string;
  readonly items: ReadonlyArray<HistoryMenuItem>;
}

export interface HistoryMenuTarget {
  readonly commitSha: string | null;
  readonly commitSubject: string | null;
  readonly refValue: VcsCommitRef | null;
  /** True when the "Uncommitted Changes" row was the target. */
  readonly isPendingRow: boolean;
}

export interface HistoryMenuContext {
  readonly currentRefName: string | null;
  readonly hasRemote: boolean;
  readonly defaultRemoteName: string;
}

const RESET_MODE_LABEL: Record<VcsResetMode, string> = {
  soft: "Soft — keep staged changes",
  mixed: "Mixed — keep working tree",
  hard: "Hard — discard everything",
};

function shortSha(sha: string): string {
  return sha.slice(0, 7);
}

/** "main" when on a branch, "HEAD" when detached — both read correctly in a label. */
function currentLabel(context: HistoryMenuContext): string {
  return context.currentRefName ?? "HEAD";
}

function resetSubmenu(commitSha: string, idPrefix: string): ReadonlyArray<HistoryMenuItem> {
  return (["soft", "mixed", "hard"] as const).map((mode) => ({
    id: `${idPrefix}:${mode}`,
    label: RESET_MODE_LABEL[mode],
    destructive: mode === "hard",
    action:
      mode === "hard"
        ? {
            kind: "confirm",
            confirm: {
              title: `Reset to ${shortSha(commitSha)}?`,
              body: "A hard reset discards every uncommitted change and every commit after this one. This cannot be undone from here.",
              confirmLabel: "Hard reset",
              action: { _tag: "resetTo", commitSha, mode },
            },
          }
        : { kind: "run", action: { _tag: "resetTo", commitSha, mode } },
  }));
}

function mergeSubmenu(
  action: (strategy: "default" | "no-fast-forward" | "squash") => VcsHistoryAction,
  idPrefix: string,
): ReadonlyArray<HistoryMenuItem> {
  return [
    {
      id: `${idPrefix}:default`,
      label: "Merge",
      action: { kind: "run", action: action("default") },
    },
    {
      id: `${idPrefix}:no-ff`,
      label: "Merge without fast-forward",
      action: { kind: "run", action: action("no-fast-forward") },
    },
    {
      id: `${idPrefix}:squash`,
      label: "Squash merge (no commit)",
      action: { kind: "run", action: action("squash") },
    },
  ];
}

function localBranchItems(
  refName: string,
  isCurrent: boolean,
  context: HistoryMenuContext,
): ReadonlyArray<HistoryMenuItem> {
  const items: Array<HistoryMenuItem> = [];

  if (!isCurrent) {
    items.push({
      id: "branch:checkout",
      label: `Check out ${refName}`,
      action: { kind: "checkout", refName },
    });
    items.push({
      id: "branch:merge",
      label: `Merge into ${currentLabel(context)}`,
      submenu: mergeSubmenu(
        (strategy) => ({ _tag: "mergeRef", refName, strategy }),
        "branch:merge",
      ),
    });
    items.push({
      id: "branch:rebase",
      label: `Rebase ${currentLabel(context)} onto ${refName}`,
      // A rebase rewrites the checked-out branch, which needs there to be one.
      disabled: context.currentRefName === null,
      action: { kind: "run", action: { _tag: "rebaseOnto", refName } },
    });
  }

  items.push({
    id: "branch:push",
    label: `Push ${refName}`,
    disabled: !context.hasRemote,
    action: {
      kind: "run",
      action: { _tag: "pushBranch", refName, setUpstream: true },
    },
  });
  items.push({
    id: "branch:rename",
    label: "Rename branch...",
    action: {
      kind: "prompt",
      prompt: {
        title: `Rename ${refName}`,
        label: "New branch name",
        placeholder: "feature/new-name",
        initialValue: refName,
        confirmLabel: "Rename",
        build: (value) => ({ _tag: "renameBranch", refName, newRefName: value }),
      },
    },
  });

  if (!isCurrent) {
    items.push({
      id: "branch:delete",
      label: "Delete branch",
      action: {
        kind: "confirm",
        confirm: {
          title: `Delete ${refName}?`,
          body: "Only a branch whose commits are already merged is deleted. Unmerged work is refused, and can be removed with Force delete.",
          confirmLabel: "Delete",
          action: { _tag: "deleteBranch", refName },
        },
      },
    });
    items.push({
      id: "branch:force-delete",
      label: "Force delete branch",
      destructive: true,
      action: {
        kind: "confirm",
        confirm: {
          title: `Force delete ${refName}?`,
          body: "Any commit only on this branch becomes unreachable. This cannot be undone from here.",
          confirmLabel: "Force delete",
          action: { _tag: "deleteBranch", refName, force: true },
        },
      },
    });
  }

  items.push({
    id: "branch:copy",
    label: "Copy branch name",
    action: { kind: "copy", value: refName, label: "branch name" },
  });
  return items;
}

function remoteBranchItems(
  ref: VcsCommitRef,
  context: HistoryMenuContext,
): ReadonlyArray<HistoryMenuItem> {
  const { remote, branch } = splitRemoteRefName(ref);
  const remoteName = remote ?? context.defaultRemoteName;

  return [
    {
      id: "remote:checkout",
      label: `Check out ${branch}`,
      action: { kind: "checkout", refName: ref.name },
    },
    {
      id: "remote:merge",
      label: `Merge into ${currentLabel(context)}`,
      submenu: mergeSubmenu(
        (strategy) => ({ _tag: "mergeRef", refName: ref.name, strategy }),
        "remote:merge",
      ),
    },
    {
      id: "remote:rebase",
      label: `Rebase ${currentLabel(context)} onto ${ref.name}`,
      disabled: context.currentRefName === null,
      action: { kind: "run", action: { _tag: "rebaseOnto", refName: ref.name } },
    },
    {
      id: "remote:pull",
      label: `Pull into ${currentLabel(context)}`,
      disabled: context.currentRefName === null,
      action: {
        kind: "run",
        action: { _tag: "pullIntoCurrent", refName: branch, remoteName },
      },
    },
    {
      id: "remote:fetch",
      // Fast-forwards the local branch of the same name without leaving the
      // branch you are on. Git refuses when that branch is the current one.
      label: `Fetch into local ${branch}`,
      disabled: context.currentRefName === branch,
      action: {
        kind: "run",
        action: {
          _tag: "fetchIntoLocalBranch",
          refName: branch,
          remoteName,
          localRefName: branch,
        },
      },
    },
    {
      id: "remote:delete",
      label: "Delete remote branch",
      destructive: true,
      action: {
        kind: "confirm",
        confirm: {
          title: `Delete ${remoteName}/${branch}?`,
          body: `This removes the branch on ${remoteName} for everyone. Your local branch is not touched.`,
          confirmLabel: "Delete remote branch",
          action: { _tag: "deleteRemoteBranch", refName: branch, remoteName },
        },
      },
    },
    {
      id: "remote:copy",
      label: "Copy branch name",
      action: { kind: "copy", value: ref.name, label: "branch name" },
    },
  ];
}

function tagItems(tagName: string, context: HistoryMenuContext): ReadonlyArray<HistoryMenuItem> {
  return [
    {
      id: "tag:checkout",
      label: `Check out ${tagName}`,
      action: { kind: "checkout", refName: tagName },
    },
    {
      id: "tag:push",
      label: "Push tag",
      disabled: !context.hasRemote,
      action: { kind: "run", action: { _tag: "pushTag", tagName } },
    },
    {
      id: "tag:delete",
      label: "Delete tag",
      destructive: true,
      action: {
        kind: "confirm",
        confirm: {
          title: `Delete tag ${tagName}?`,
          body: "The tag is removed locally. Any copy already pushed to a remote stays there.",
          confirmLabel: "Delete tag",
          action: { _tag: "deleteTag", tagName },
        },
      },
    },
    {
      id: "tag:delete-everywhere",
      label: "Delete tag locally and on remote",
      destructive: true,
      disabled: !context.hasRemote,
      action: {
        kind: "confirm",
        confirm: {
          title: `Delete tag ${tagName} everywhere?`,
          body: `The tag is removed locally and on ${context.defaultRemoteName}, for everyone.`,
          confirmLabel: "Delete everywhere",
          action: { _tag: "deleteTag", tagName, remoteName: context.defaultRemoteName },
        },
      },
    },
    {
      id: "tag:copy",
      label: "Copy tag name",
      action: { kind: "copy", value: tagName, label: "tag name" },
    },
  ];
}

function stashItems(stashRef: string): ReadonlyArray<HistoryMenuItem> {
  return [
    {
      id: "stash:apply",
      label: "Apply stash",
      action: { kind: "run", action: { _tag: "stashApply", stashRef } },
    },
    {
      id: "stash:pop",
      label: "Pop stash",
      action: { kind: "run", action: { _tag: "stashPop", stashRef } },
    },
    {
      id: "stash:branch",
      label: "Create branch from stash...",
      action: {
        kind: "prompt",
        prompt: {
          title: `Create a branch from ${stashRef}`,
          label: "Branch name",
          placeholder: "feature/from-stash",
          initialValue: "",
          confirmLabel: "Create branch",
          build: (value) => ({ _tag: "stashBranch", stashRef, refName: value }),
        },
      },
    },
    {
      id: "stash:drop",
      label: "Drop stash",
      destructive: true,
      action: {
        kind: "confirm",
        confirm: {
          title: `Drop ${stashRef}?`,
          body: "The stashed changes are discarded. This cannot be undone from here.",
          confirmLabel: "Drop stash",
          action: { _tag: "stashDrop", stashRef },
        },
      },
    },
    {
      id: "stash:copy",
      label: "Copy stash name",
      action: { kind: "copy", value: stashRef, label: "stash name" },
    },
  ];
}

function commitItems(
  commitSha: string,
  context: HistoryMenuContext,
): ReadonlyArray<HistoryMenuItem> {
  const label = shortSha(commitSha);
  return [
    {
      id: "commit:branch",
      label: "Create branch here...",
      action: {
        kind: "prompt",
        prompt: {
          title: `Create a branch at ${label}`,
          label: "Branch name",
          placeholder: "feature/new-branch",
          initialValue: "",
          confirmLabel: "Create branch",
          build: (value) => ({ _tag: "createBranchAt", commitSha, refName: value, checkout: true }),
        },
      },
    },
    {
      id: "commit:tag",
      label: "Create tag here...",
      action: {
        kind: "prompt",
        prompt: {
          title: `Tag ${label}`,
          label: "Tag name",
          placeholder: "v1.0.0",
          initialValue: "",
          confirmLabel: "Create tag",
          build: (value) => ({ _tag: "createTag", commitSha, tagName: value }),
        },
      },
    },
    {
      id: "commit:checkout",
      label: "Check out this commit",
      action: { kind: "run", action: { _tag: "checkoutDetached", commitSha } },
    },
    {
      id: "commit:merge",
      label: `Merge into ${currentLabel(context)}`,
      submenu: mergeSubmenu(
        (strategy) => ({ _tag: "mergeCommit", commitSha, strategy }),
        "commit:merge",
      ),
    },
    {
      id: "commit:rebase",
      label: `Rebase ${currentLabel(context)} onto this commit`,
      disabled: context.currentRefName === null,
      action: { kind: "run", action: { _tag: "rebaseOnto", refName: commitSha } },
    },
    {
      id: "commit:cherry-pick",
      label: "Cherry-pick",
      action: { kind: "run", action: { _tag: "cherryPick", commitSha } },
    },
    {
      id: "commit:revert",
      label: "Revert",
      action: { kind: "run", action: { _tag: "revertCommit", commitSha } },
    },
    {
      id: "commit:reset",
      label: `Reset ${currentLabel(context)} to this commit`,
      disabled: context.currentRefName === null,
      submenu: resetSubmenu(commitSha, "commit:reset"),
    },
    {
      id: "commit:drop",
      label: "Drop this commit",
      destructive: true,
      disabled: context.currentRefName === null,
      action: {
        kind: "confirm",
        confirm: {
          title: `Drop ${label}?`,
          body: "Every commit after this one is rewritten to exclude it. Anyone who already has these commits will need to reset.",
          confirmLabel: "Drop commit",
          action: { _tag: "dropCommit", commitSha },
        },
      },
    },
  ];
}

function pendingItems(): ReadonlyArray<HistoryMenuItem> {
  return [
    {
      id: "pending:stash",
      label: "Stash uncommitted changes...",
      action: {
        kind: "prompt",
        prompt: {
          title: "Stash uncommitted changes",
          label: "Description (optional)",
          placeholder: "work in progress",
          initialValue: "",
          confirmLabel: "Stash",
          optional: true,
          build: (value) => ({
            _tag: "stashPush",
            includeUntracked: true,
            ...(value.length > 0 ? { message: value } : {}),
          }),
        },
      },
    },
    {
      id: "pending:reset",
      label: "Reset uncommitted changes",
      submenu: [
        {
          id: "pending:reset:mixed",
          label: "Mixed — unstage, keep edits",
          action: { kind: "run", action: { _tag: "resetUncommitted", mode: "mixed" } },
        },
        {
          id: "pending:reset:hard",
          label: "Hard — discard all edits",
          destructive: true,
          action: {
            kind: "confirm",
            confirm: {
              title: "Discard all uncommitted changes?",
              body: "Every edit to a tracked file is thrown away. This cannot be undone from here.",
              confirmLabel: "Discard changes",
              action: { _tag: "resetUncommitted", mode: "hard" },
            },
          },
        },
      ],
    },
    {
      id: "pending:clean",
      label: "Clean untracked files",
      destructive: true,
      action: {
        kind: "confirm",
        confirm: {
          title: "Delete untracked files?",
          body: "Every file Git is not tracking, including new untracked folders, is deleted from disk. This cannot be undone from here.",
          confirmLabel: "Delete untracked files",
          action: { _tag: "cleanUntracked", includeDirectories: true },
        },
      },
    },
  ];
}

/**
 * Builds the menu for one right-click. The ref group only appears when a ref
 * badge was the target, so clicking the row itself gives the plain commit menu.
 */
export function buildHistoryMenu(
  target: HistoryMenuTarget,
  context: HistoryMenuContext,
): ReadonlyArray<HistoryMenuGroup> {
  if (target.isPendingRow) {
    return [{ id: "pending", items: pendingItems() }];
  }

  const groups: Array<HistoryMenuGroup> = [];
  const ref = target.refValue;

  if (ref !== null && ref.kind !== "head") {
    const items =
      ref.kind === "local"
        ? localBranchItems(ref.name, ref.isCurrent, context)
        : ref.kind === "remote"
          ? remoteBranchItems(ref, context)
          : ref.kind === "tag"
            ? tagItems(ref.name, context)
            : stashItems(ref.name);
    groups.push({ id: `ref:${ref.kind}`, items });
  }

  // A stash is not a commit you can rebase onto or tag, so its row stops here.
  if (target.commitSha !== null && ref?.kind !== "stash") {
    groups.push({ id: "commit", items: commitItems(target.commitSha, context) });
  }

  const copyItems: Array<HistoryMenuItem> = [];
  if (target.commitSha !== null) {
    copyItems.push({
      id: "copy:sha",
      label: "Copy commit SHA",
      action: { kind: "copy", value: target.commitSha, label: "commit SHA" },
    });
  }
  if (target.commitSubject !== null) {
    copyItems.push({
      id: "copy:subject",
      label: "Copy commit message",
      action: { kind: "copy", value: target.commitSubject, label: "commit message" },
    });
  }
  if (copyItems.length > 0) groups.push({ id: "copy", items: copyItems });

  return groups;
}
