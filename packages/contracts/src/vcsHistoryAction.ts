/**
 * Mutating operations the commit-graph context menus can run.
 *
 * These are modelled as one tagged union rather than one RPC per verb: the
 * history surface needs the whole matrix (branch, commit, tag, stash, working
 * tree) and every entry shares the same guard/abort policy, so a single method
 * keeps that policy in one place instead of spread across twenty handlers.
 *
 * The operation set mirrors the VS Code Git Graph context menus, which Fork,
 * GitKraken and Sublime Merge are all supersets of.
 */
import * as Schema from "effect/Schema";

import { NonNegativeInt, PositiveInt, TrimmedNonEmptyString } from "./baseSchemas.ts";

const Cwd = TrimmedNonEmptyString;
const RefName = TrimmedNonEmptyString.check(Schema.isMaxLength(255));
const CommitSha = TrimmedNonEmptyString.check(Schema.isMaxLength(64));
/** `stash@{0}` — the only form `git stash` accepts for a specific entry. */
const StashRef = TrimmedNonEmptyString.check(Schema.isMaxLength(64));

/**
 * `soft` keeps the index and working tree, `mixed` keeps the working tree only,
 * `hard` discards both. Matches `git reset --<mode>`.
 */
export const VcsResetMode = Schema.Literals(["soft", "mixed", "hard"]);
export type VcsResetMode = typeof VcsResetMode.Type;

/** `hard` is the only destructive uncommitted reset worth offering next to `mixed`. */
export const VcsUncommittedResetMode = Schema.Literals(["mixed", "hard"]);
export type VcsUncommittedResetMode = typeof VcsUncommittedResetMode.Type;

export const VcsMergeStrategy = Schema.Literals(["default", "no-fast-forward", "squash"]);
export type VcsMergeStrategy = typeof VcsMergeStrategy.Type;

export const VcsHistoryAction = Schema.Union([
  // --- Branch targets -------------------------------------------------------
  /** `git merge <refName>` into the checked-out branch. */
  Schema.TaggedStruct("mergeRef", {
    refName: RefName,
    strategy: Schema.optional(VcsMergeStrategy),
  }),
  /** `git rebase <refName>` — replays the current branch on top of the target. */
  Schema.TaggedStruct("rebaseOnto", {
    refName: RefName,
    ignoreDate: Schema.optional(Schema.Boolean),
  }),
  Schema.TaggedStruct("deleteBranch", {
    refName: RefName,
    force: Schema.optional(Schema.Boolean),
  }),
  Schema.TaggedStruct("deleteRemoteBranch", {
    refName: RefName,
    remoteName: RefName,
  }),
  Schema.TaggedStruct("renameBranch", {
    refName: RefName,
    newRefName: RefName,
  }),
  Schema.TaggedStruct("pushBranch", {
    refName: RefName,
    remoteName: Schema.optional(RefName),
    setUpstream: Schema.optional(Schema.Boolean),
    force: Schema.optional(Schema.Boolean),
  }),
  /**
   * `git pull <remote> <branch>` into the current branch. `refName` is the
   * branch as it exists on the remote, without the `origin/` prefix.
   */
  Schema.TaggedStruct("pullIntoCurrent", {
    refName: RefName,
    remoteName: RefName,
  }),
  /** Fast-forwards a local branch from its remote without checking it out. */
  Schema.TaggedStruct("fetchIntoLocalBranch", {
    refName: RefName,
    remoteName: RefName,
    localRefName: RefName,
  }),

  // --- Commit targets -------------------------------------------------------
  Schema.TaggedStruct("cherryPick", {
    commitSha: CommitSha,
    parentNumber: Schema.optional(PositiveInt),
    noCommit: Schema.optional(Schema.Boolean),
  }),
  Schema.TaggedStruct("revertCommit", {
    commitSha: CommitSha,
    parentNumber: Schema.optional(PositiveInt),
  }),
  /** Rebase-drops a single commit out of the current branch. */
  Schema.TaggedStruct("dropCommit", {
    commitSha: CommitSha,
  }),
  Schema.TaggedStruct("resetTo", {
    commitSha: CommitSha,
    mode: VcsResetMode,
  }),
  Schema.TaggedStruct("createBranchAt", {
    commitSha: CommitSha,
    refName: RefName,
    checkout: Schema.optional(Schema.Boolean),
  }),
  Schema.TaggedStruct("checkoutDetached", {
    commitSha: CommitSha,
  }),
  Schema.TaggedStruct("mergeCommit", {
    commitSha: CommitSha,
    strategy: Schema.optional(VcsMergeStrategy),
  }),

  // --- Tag targets ----------------------------------------------------------
  Schema.TaggedStruct("createTag", {
    commitSha: CommitSha,
    tagName: RefName,
    message: Schema.optional(TrimmedNonEmptyString.check(Schema.isMaxLength(1024))),
  }),
  Schema.TaggedStruct("deleteTag", {
    tagName: RefName,
    remoteName: Schema.optional(RefName),
  }),
  Schema.TaggedStruct("pushTag", {
    tagName: RefName,
    remoteName: Schema.optional(RefName),
  }),

  // --- Stash targets --------------------------------------------------------
  Schema.TaggedStruct("stashPush", {
    message: Schema.optional(TrimmedNonEmptyString.check(Schema.isMaxLength(1024))),
    includeUntracked: Schema.optional(Schema.Boolean),
  }),
  Schema.TaggedStruct("stashApply", {
    stashRef: StashRef,
    reinstateIndex: Schema.optional(Schema.Boolean),
  }),
  Schema.TaggedStruct("stashPop", {
    stashRef: StashRef,
    reinstateIndex: Schema.optional(Schema.Boolean),
  }),
  Schema.TaggedStruct("stashDrop", {
    stashRef: StashRef,
  }),
  Schema.TaggedStruct("stashBranch", {
    stashRef: StashRef,
    refName: RefName,
  }),

  // --- Working tree ---------------------------------------------------------
  Schema.TaggedStruct("resetUncommitted", {
    mode: VcsUncommittedResetMode,
  }),
  Schema.TaggedStruct("cleanUntracked", {
    includeDirectories: Schema.optional(Schema.Boolean),
  }),
]);
export type VcsHistoryAction = typeof VcsHistoryAction.Type;
export type VcsHistoryActionTag = VcsHistoryAction["_tag"];

export const VcsHistoryActionInput = Schema.Struct({
  cwd: Cwd,
  action: VcsHistoryAction,
});
export type VcsHistoryActionInput = typeof VcsHistoryActionInput.Type;

/**
 * Why an action was refused before any Git state changed. Each reason maps to a
 * distinct fix the user has to make, so the UI can say what to do rather than
 * echoing stderr.
 */
export const VcsHistoryBlockedReason = Schema.Literals([
  "not-a-repo",
  "dirty-working-tree",
  "operation-in-progress",
  "detached-head",
  "unborn-branch",
  "no-remote",
  "ref-not-found",
  "ref-exists",
  "current-branch",
  "unsupported",
]);
export type VcsHistoryBlockedReason = typeof VcsHistoryBlockedReason.Type;

/** The Git operation that produced a conflict, so the UI can name it. */
export const VcsHistoryConflictSource = Schema.Literals([
  "merge",
  "rebase",
  "cherry-pick",
  "revert",
  "stash",
  "pull",
]);
export type VcsHistoryConflictSource = typeof VcsHistoryConflictSource.Type;

export const VcsHistoryActionResult = Schema.Union([
  Schema.TaggedStruct("ok", {
    /** Human-readable summary for the success toast. */
    detail: Schema.String,
    /** The branch checked out once the action settled, when it changed. */
    refName: Schema.NullOr(TrimmedNonEmptyString),
  }),
  Schema.TaggedStruct("blocked", {
    reason: VcsHistoryBlockedReason,
    detail: Schema.String,
  }),
  /**
   * The command conflicted and was rolled back, so the repository is back on
   * the state it had before. `paths` lists what collided.
   */
  Schema.TaggedStruct("conflicted", {
    source: VcsHistoryConflictSource,
    detail: Schema.String,
    paths: Schema.Array(TrimmedNonEmptyString),
    /** False when the rollback itself failed and the tree needs manual repair. */
    rolledBack: Schema.Boolean,
  }),
]);
export type VcsHistoryActionResult = typeof VcsHistoryActionResult.Type;

export const VcsStashEntry = Schema.Struct({
  /** `stash@{0}` */
  ref: StashRef,
  index: NonNegativeInt,
  sha: CommitSha,
  shortSha: TrimmedNonEmptyString,
  /** The commit the stash was taken from. */
  baseSha: CommitSha,
  message: Schema.String,
  branchName: Schema.NullOr(TrimmedNonEmptyString),
  stashedAt: Schema.DateTimeUtc,
});
export type VcsStashEntry = typeof VcsStashEntry.Type;

export const VcsListStashesInput = Schema.Struct({
  cwd: Cwd,
});
export type VcsListStashesInput = typeof VcsListStashesInput.Type;

export const VcsListStashesResult = Schema.Struct({
  stashes: Schema.Array(VcsStashEntry),
  isRepo: Schema.Boolean,
});
export type VcsListStashesResult = typeof VcsListStashesResult.Type;
