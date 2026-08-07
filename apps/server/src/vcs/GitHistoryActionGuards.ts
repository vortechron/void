/**
 * Pre-flight checks and rollback for the commit-graph mutating actions.
 *
 * The history surface refuses rather than repairs: an action that needs a clean
 * tree is blocked before Git runs, and one that conflicts mid-flight is aborted
 * so the repository lands back where it started. Nothing is ever left half
 * applied for the user to discover later.
 */
import type {
  VcsHistoryAction,
  VcsHistoryActionResult,
  VcsHistoryConflictSource,
} from "@t3tools/contracts";
import type { GitCommandError } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import type * as GitVcsDriver from "./GitVcsDriver.ts";

export interface RunGit {
  (
    operation: string,
    cwd: string,
    args: ReadonlyArray<string>,
    options?: { readonly timeoutMs?: number; readonly allowNonZeroExit?: boolean },
  ): Effect.Effect<GitVcsDriver.ExecuteGitResult, GitCommandError>;
}

/** Long enough for a rebase over a large range, short enough to not hang a tab. */
export const HISTORY_ACTION_TIMEOUT_MS = 120_000;
const GUARD_TIMEOUT_MS = 10_000;

export interface RepositoryState {
  readonly isRepo: boolean;
  readonly headRefName: string | null;
  readonly isDetached: boolean;
  readonly isUnborn: boolean;
  /** Tracked paths with staged or unstaged edits. Untracked files are excluded. */
  readonly dirtyPaths: ReadonlyArray<string>;
  readonly inProgress: VcsHistoryConflictSource | null;
}

const ok = (result: GitVcsDriver.ExecuteGitResult) => result.exitCode === 0;

/**
 * `git status --porcelain` prefixes every entry with a two-character XY code.
 * `??` is untracked and `!!` is ignored; everything else is a tracked change
 * that would make a merge or rebase refuse to start.
 */
export function parseTrackedDirtyPaths(stdout: string): ReadonlyArray<string> {
  const paths: Array<string> = [];
  for (const line of stdout.split("\n")) {
    if (line.length < 4) continue;
    const code = line.slice(0, 2);
    if (code === "??" || code === "!!") continue;
    // Renames read `R  old -> new`; the destination is the interesting path.
    const raw = line.slice(3);
    const arrow = raw.indexOf(" -> ");
    paths.push(arrow === -1 ? raw : raw.slice(arrow + 4));
  }
  return paths;
}

export const readRepositoryState = Effect.fn("GitHistoryActions.readRepositoryState")(function* (
  runGit: RunGit,
  cwd: string,
) {
  const isRepo = yield* runGit(
    "GitHistoryActions.isRepo",
    cwd,
    ["rev-parse", "--is-inside-work-tree"],
    { allowNonZeroExit: true, timeoutMs: GUARD_TIMEOUT_MS },
  ).pipe(Effect.map((result) => ok(result) && result.stdout.trim() === "true"));

  if (!isRepo) {
    return {
      isRepo: false,
      headRefName: null,
      isDetached: false,
      isUnborn: false,
      dirtyPaths: [],
      inProgress: null,
    } satisfies RepositoryState;
  }

  const verify = (ref: string) =>
    runGit(`GitHistoryActions.verify.${ref}`, cwd, ["rev-parse", "--verify", "--quiet", ref], {
      allowNonZeroExit: true,
      timeoutMs: GUARD_TIMEOUT_MS,
    }).pipe(Effect.map(ok));

  const [branch, headExists, status, merging, cherryPicking, reverting, rebasing] =
    yield* Effect.all(
      [
        runGit("GitHistoryActions.currentBranch", cwd, ["branch", "--show-current"], {
          allowNonZeroExit: true,
          timeoutMs: GUARD_TIMEOUT_MS,
        }).pipe(Effect.map((result) => (ok(result) ? result.stdout.trim() : ""))),
        verify("HEAD"),
        runGit("GitHistoryActions.status", cwd, ["status", "--porcelain"], {
          allowNonZeroExit: true,
          timeoutMs: GUARD_TIMEOUT_MS,
        }).pipe(Effect.map((result) => (ok(result) ? result.stdout : ""))),
        verify("MERGE_HEAD"),
        verify("CHERRY_PICK_HEAD"),
        verify("REVERT_HEAD"),
        verify("REBASE_HEAD"),
      ],
      { concurrency: "unbounded" },
    );

  return {
    isRepo: true,
    headRefName: branch.length > 0 ? branch : null,
    isDetached: headExists && branch.length === 0,
    isUnborn: !headExists,
    dirtyPaths: parseTrackedDirtyPaths(status),
    inProgress: merging
      ? "merge"
      : cherryPicking
        ? "cherry-pick"
        : reverting
          ? "revert"
          : rebasing
            ? "rebase"
            : null,
  } satisfies RepositoryState;
});

/** Actions that Git itself refuses to start against a modified tracked tree. */
const REQUIRES_CLEAN_TREE = new Set<VcsHistoryAction["_tag"]>([
  "mergeRef",
  "mergeCommit",
  "rebaseOnto",
  "dropCommit",
  "cherryPick",
  "revertCommit",
  "checkoutDetached",
  "pullIntoCurrent",
  "stashApply",
  "stashPop",
  "stashBranch",
]);

/** Actions that write to the checked-out branch, so a detached HEAD is wrong. */
const REQUIRES_BRANCH = new Set<VcsHistoryAction["_tag"]>([
  "rebaseOnto",
  "dropCommit",
  "pullIntoCurrent",
  "pushBranch",
]);

/** Actions that need at least one commit to exist. */
const REQUIRES_COMMIT = new Set<VcsHistoryAction["_tag"]>([
  "mergeRef",
  "mergeCommit",
  "rebaseOnto",
  "dropCommit",
  "cherryPick",
  "revertCommit",
  "resetTo",
  "resetUncommitted",
  "stashPush",
]);

/**
 * Which Git verb owns the in-flight operation, so a conflict can be rolled back
 * with the matching `--abort`. Stash replays have no `--abort`, so they are
 * rolled back with a hard reset — safe only because the clean-tree guard ran.
 */
const CONFLICT_SOURCE: Partial<Record<VcsHistoryAction["_tag"], VcsHistoryConflictSource>> = {
  mergeRef: "merge",
  mergeCommit: "merge",
  pullIntoCurrent: "pull",
  rebaseOnto: "rebase",
  dropCommit: "rebase",
  cherryPick: "cherry-pick",
  revertCommit: "revert",
  stashApply: "stash",
  stashPop: "stash",
  stashBranch: "stash",
};

export function conflictSourceFor(tag: VcsHistoryAction["_tag"]): VcsHistoryConflictSource | null {
  return CONFLICT_SOURCE[tag] ?? null;
}

const blocked = (
  reason: Extract<VcsHistoryActionResult, { _tag: "blocked" }>["reason"],
  detail: string,
): VcsHistoryActionResult => ({ _tag: "blocked", reason, detail });

/**
 * Returns the refusal to send back, or null when the action may run. Checks run
 * cheapest-first so a non-repository never pays for a status pass.
 */
export function checkGuards(
  action: VcsHistoryAction,
  state: RepositoryState,
): VcsHistoryActionResult | null {
  if (!state.isRepo) {
    return blocked("not-a-repo", "This folder is not a Git repository.");
  }

  if (state.inProgress !== null) {
    return blocked(
      "operation-in-progress",
      `A ${state.inProgress} is already in progress. Finish or abort it first.`,
    );
  }

  if (state.isUnborn && REQUIRES_COMMIT.has(action._tag)) {
    return blocked("unborn-branch", "This branch has no commits yet.");
  }

  if (state.isDetached && REQUIRES_BRANCH.has(action._tag)) {
    return blocked("detached-head", "HEAD is detached. Check out a branch first.");
  }

  if (state.dirtyPaths.length > 0 && REQUIRES_CLEAN_TREE.has(action._tag)) {
    const preview = state.dirtyPaths.slice(0, 3).join(", ");
    const rest = state.dirtyPaths.length - 3;
    return blocked(
      "dirty-working-tree",
      `Commit or stash your changes first (${preview}${rest > 0 ? ` and ${rest} more` : ""}).`,
    );
  }

  if (action._tag === "deleteBranch" && action.refName === state.headRefName) {
    return blocked("current-branch", "You cannot delete the branch you are on.");
  }

  if (action._tag === "fetchIntoLocalBranch" && action.localRefName === state.headRefName) {
    return blocked(
      "current-branch",
      `${action.localRefName} is checked out. Use Pull into current branch instead.`,
    );
  }

  if (action._tag === "stashPush" && state.dirtyPaths.length === 0) {
    return blocked("dirty-working-tree", "There are no tracked changes to stash.");
  }

  return null;
}

/** Paths Git left in a conflicted (unmerged) state. */
export const readConflictPaths = Effect.fn("GitHistoryActions.readConflictPaths")(function* (
  runGit: RunGit,
  cwd: string,
) {
  const result = yield* runGit(
    "GitHistoryActions.conflictPaths",
    cwd,
    ["diff", "--name-only", "--diff-filter=U", "--relative"],
    { allowNonZeroExit: true, timeoutMs: GUARD_TIMEOUT_MS },
  );
  if (!ok(result)) return [] as ReadonlyArray<string>;
  return result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
});

const ABORT_ARGS: Record<VcsHistoryConflictSource, ReadonlyArray<string>> = {
  merge: ["merge", "--abort"],
  pull: ["merge", "--abort"],
  rebase: ["rebase", "--abort"],
  "cherry-pick": ["cherry-pick", "--abort"],
  revert: ["revert", "--abort"],
  // A stash replay has no abort verb. The clean-tree guard means HEAD is the
  // exact state to return to, and neither apply nor a conflicted pop drops the
  // stash entry, so nothing is lost.
  stash: ["reset", "--hard", "HEAD"],
};

/** Rolls the repository back to its pre-action state. Reports whether it worked. */
export const rollback = Effect.fn("GitHistoryActions.rollback")(function* (
  runGit: RunGit,
  cwd: string,
  source: VcsHistoryConflictSource,
) {
  const result = yield* runGit(`GitHistoryActions.rollback.${source}`, cwd, ABORT_ARGS[source], {
    allowNonZeroExit: true,
    timeoutMs: HISTORY_ACTION_TIMEOUT_MS,
  }).pipe(Effect.orElseSucceed(() => null));
  return result !== null && ok(result);
});

/**
 * Git reports conflicts on stderr with a stable set of phrases across verbs.
 * Checked alongside the unmerged-path list because `--squash` and `git clean`
 * failures conflict without leaving unmerged entries behind.
 */
const CONFLICT_PATTERN =
  /\b(CONFLICT|Automatic merge failed|could not apply|needs merge|would be overwritten by|Merge conflict)\b/i;

export function looksLikeConflict(stderr: string, stdout: string): boolean {
  return CONFLICT_PATTERN.test(stderr) || CONFLICT_PATTERN.test(stdout);
}
