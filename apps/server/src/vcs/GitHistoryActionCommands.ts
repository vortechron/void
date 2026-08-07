/**
 * Maps each commit-graph action onto the Git argv that performs it.
 *
 * Kept pure and separate from execution so the argv for twenty-odd verbs can be
 * asserted directly in tests, without a repository or a process spawn.
 */
import type { VcsHistoryAction, VcsMergeStrategy } from "@t3tools/contracts";

export interface GitHistoryCommand {
  /** Sequential steps. Every step must succeed for the action to be `ok`. */
  readonly steps: ReadonlyArray<ReadonlyArray<string>>;
  /** Success toast text. */
  readonly detail: string;
  /** True when the action can change which branch is checked out. */
  readonly changesHead: boolean;
}

function mergeFlags(strategy: VcsMergeStrategy | undefined): ReadonlyArray<string> {
  if (strategy === "no-fast-forward") return ["--no-ff", "--no-edit"];
  if (strategy === "squash") return ["--squash"];
  return ["--no-edit"];
}

function mergeDetail(target: string, strategy: VcsMergeStrategy | undefined): string {
  if (strategy === "squash") return `Squashed ${target} into the working tree.`;
  return `Merged ${target} into the current branch.`;
}

/**
 * `--` is appended to argument positions that take a pathspec so a ref named
 * like a path can never be reinterpreted as one.
 */
export function buildHistoryCommand(
  action: VcsHistoryAction,
  context: { readonly remoteName: string | null },
): GitHistoryCommand {
  switch (action._tag) {
    case "mergeRef":
      return {
        steps: [["merge", ...mergeFlags(action.strategy), action.refName, "--"]],
        detail: mergeDetail(action.refName, action.strategy),
        changesHead: false,
      };
    case "mergeCommit":
      return {
        steps: [["merge", ...mergeFlags(action.strategy), action.commitSha, "--"]],
        detail: mergeDetail(action.commitSha.slice(0, 7), action.strategy),
        changesHead: false,
      };
    case "rebaseOnto":
      return {
        steps: [["rebase", ...(action.ignoreDate ? ["--ignore-date"] : []), action.refName, "--"]],
        detail: `Rebased the current branch onto ${action.refName}.`,
        changesHead: false,
      };
    case "dropCommit":
      return {
        steps: [["rebase", "--onto", `${action.commitSha}^`, action.commitSha, "--"]],
        detail: `Dropped ${action.commitSha.slice(0, 7)}.`,
        changesHead: false,
      };
    case "deleteBranch":
      return {
        steps: [["branch", action.force ? "-D" : "-d", "--", action.refName]],
        detail: `Deleted ${action.refName}.`,
        changesHead: false,
      };
    case "deleteRemoteBranch":
      return {
        steps: [["push", action.remoteName, "--delete", "--", action.refName]],
        detail: `Deleted ${action.remoteName}/${action.refName}.`,
        changesHead: false,
      };
    case "renameBranch":
      return {
        steps: [["branch", "-m", "--", action.refName, action.newRefName]],
        detail: `Renamed ${action.refName} to ${action.newRefName}.`,
        changesHead: true,
      };
    case "pushBranch": {
      const remote = action.remoteName ?? context.remoteName ?? "origin";
      return {
        steps: [
          [
            "push",
            // Never a bare --force: a lease still refuses when the remote moved
            // under us, which is the case that loses someone else's work.
            ...(action.force ? ["--force-with-lease"] : []),
            ...(action.setUpstream ? ["--set-upstream"] : []),
            remote,
            `refs/heads/${action.refName}:refs/heads/${action.refName}`,
          ],
        ],
        detail: `Pushed ${action.refName} to ${remote}.`,
        changesHead: false,
      };
    }
    case "pullIntoCurrent":
      return {
        steps: [["pull", "--no-edit", action.remoteName, action.refName]],
        detail: `Pulled ${action.remoteName}/${action.refName} into the current branch.`,
        changesHead: false,
      };
    case "fetchIntoLocalBranch":
      return {
        steps: [["fetch", action.remoteName, `${action.refName}:${action.localRefName}`]],
        detail: `Updated ${action.localRefName} from ${action.remoteName}/${action.refName}.`,
        changesHead: false,
      };
    case "cherryPick":
      return {
        steps: [
          [
            "cherry-pick",
            ...(action.parentNumber ? ["-m", String(action.parentNumber)] : []),
            ...(action.noCommit ? ["--no-commit"] : []),
            action.commitSha,
          ],
        ],
        detail: `Cherry-picked ${action.commitSha.slice(0, 7)}.`,
        changesHead: false,
      };
    case "revertCommit":
      return {
        steps: [
          [
            "revert",
            "--no-edit",
            ...(action.parentNumber ? ["-m", String(action.parentNumber)] : []),
            action.commitSha,
          ],
        ],
        detail: `Reverted ${action.commitSha.slice(0, 7)}.`,
        changesHead: false,
      };
    case "resetTo":
      return {
        steps: [["reset", `--${action.mode}`, action.commitSha, "--"]],
        detail: `Reset the current branch to ${action.commitSha.slice(0, 7)} (${action.mode}).`,
        changesHead: false,
      };
    case "createBranchAt":
      return {
        steps: [
          ["branch", "--", action.refName, action.commitSha],
          ...(action.checkout ? [["checkout", action.refName, "--"]] : []),
        ],
        detail: action.checkout
          ? `Created and checked out ${action.refName}.`
          : `Created ${action.refName}.`,
        changesHead: action.checkout === true,
      };
    case "checkoutDetached":
      return {
        steps: [["checkout", "--detach", action.commitSha, "--"]],
        detail: `Checked out ${action.commitSha.slice(0, 7)} as a detached HEAD.`,
        changesHead: true,
      };
    case "createTag":
      return {
        steps: [
          action.message
            ? ["tag", "-a", "-m", action.message, action.tagName, action.commitSha]
            : ["tag", action.tagName, action.commitSha],
        ],
        detail: `Tagged ${action.commitSha.slice(0, 7)} as ${action.tagName}.`,
        changesHead: false,
      };
    case "deleteTag":
      return {
        steps: [
          ["tag", "-d", action.tagName],
          ...(action.remoteName
            ? [["push", action.remoteName, "--delete", `refs/tags/${action.tagName}`]]
            : []),
        ],
        detail: action.remoteName
          ? `Deleted tag ${action.tagName} locally and on ${action.remoteName}.`
          : `Deleted tag ${action.tagName}.`,
        changesHead: false,
      };
    case "pushTag": {
      const remote = action.remoteName ?? context.remoteName ?? "origin";
      return {
        steps: [["push", remote, `refs/tags/${action.tagName}`]],
        detail: `Pushed tag ${action.tagName} to ${remote}.`,
        changesHead: false,
      };
    }
    case "stashPush":
      return {
        steps: [
          [
            "stash",
            "push",
            ...(action.includeUntracked ? ["--include-untracked"] : []),
            ...(action.message ? ["--message", action.message] : []),
          ],
        ],
        detail: "Stashed the uncommitted changes.",
        changesHead: false,
      };
    case "stashApply":
      return {
        steps: [["stash", "apply", ...(action.reinstateIndex ? ["--index"] : []), action.stashRef]],
        detail: `Applied ${action.stashRef}.`,
        changesHead: false,
      };
    case "stashPop":
      return {
        steps: [["stash", "pop", ...(action.reinstateIndex ? ["--index"] : []), action.stashRef]],
        detail: `Popped ${action.stashRef}.`,
        changesHead: false,
      };
    case "stashDrop":
      return {
        steps: [["stash", "drop", action.stashRef]],
        detail: `Dropped ${action.stashRef}.`,
        changesHead: false,
      };
    case "stashBranch":
      return {
        steps: [["stash", "branch", action.refName, action.stashRef]],
        detail: `Created ${action.refName} from ${action.stashRef}.`,
        changesHead: true,
      };
    case "resetUncommitted":
      return {
        steps: [["reset", `--${action.mode}`, "HEAD", "--"]],
        detail:
          action.mode === "hard" ? "Discarded all uncommitted changes." : "Unstaged all changes.",
        changesHead: false,
      };
    case "cleanUntracked":
      return {
        steps: [["clean", "--force", ...(action.includeDirectories ? ["-d"] : [])]],
        detail: "Removed the untracked files.",
        changesHead: false,
      };
  }
}
