/**
 * Runs the commit-graph context-menu actions.
 *
 * Every action follows the same shape: guard, run, and on conflict roll back so
 * the repository is never left half-applied. Refusals and rolled-back conflicts
 * come back as ordinary results rather than errors, because both are outcomes
 * the user needs described, not stack traces.
 */
import {
  GitCommandError,
  type VcsHistoryAction,
  type VcsHistoryActionResult,
  type VcsListStashesResult,
  type VcsStashEntry,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { COMMIT_LOG_FIELD_SEPARATOR } from "../git/commitLog.ts";
import { buildHistoryCommand } from "./GitHistoryActionCommands.ts";
import {
  HISTORY_ACTION_TIMEOUT_MS,
  type RunGit,
  checkGuards,
  conflictSourceFor,
  looksLikeConflict,
  readConflictPaths,
  readRepositoryState,
  rollback,
} from "./GitHistoryActionGuards.ts";

/** sha, short sha, parents, `stash@{n}`, commit date, reflog subject. */
export const STASH_LOG_FORMAT = "%H%x00%h%x00%P%x00%gd%x00%cI%x00%gs";

/**
 * Reflog subjects read `WIP on <branch>: <sha> <subject>` for an automatic
 * stash and `On <branch>: <message>` for a named one.
 */
function parseStashSubject(subject: string): {
  readonly branchName: string | null;
  readonly message: string;
} {
  const match = subject.match(/^(?:WIP on|On) ([^:]+): (.*)$/s);
  if (!match?.[1] || match[2] === undefined) return { branchName: null, message: subject };
  return { branchName: match[1], message: match[2] };
}

/** Mirrors `parseCommitLog`: a malformed entry is dropped, not fatal. */
export function parseStashList(stdout: string): ReadonlyArray<VcsStashEntry> {
  const entries: Array<VcsStashEntry> = [];
  for (const line of stdout.split("\n")) {
    if (line.trim().length === 0) continue;
    const fields = line.split(COMMIT_LOG_FIELD_SEPARATOR);
    if (fields.length < 6) continue;

    const [sha = "", shortSha = "", parentList = "", ref = "", stashedAtRaw = ""] = fields;
    // Rejoin so a stash message containing the separator cannot truncate itself.
    const subject = fields.slice(5).join(COMMIT_LOG_FIELD_SEPARATOR);
    if (sha.length === 0 || shortSha.length === 0 || ref.length === 0) continue;

    const stashedAt = Option.getOrNull(DateTime.make(stashedAtRaw));
    if (stashedAt === null) continue;

    // A stash's first parent is the commit it was taken from; the second and
    // third hold the index and untracked snapshots, which are not graph nodes.
    const baseSha = parentList.trim().split(/\s+/)[0] ?? "";
    const { branchName, message } = parseStashSubject(subject);
    entries.push({
      ref,
      index: entries.length,
      sha,
      shortSha,
      baseSha: baseSha.length > 0 ? baseSha : sha,
      message,
      branchName,
      stashedAt,
    });
  }
  return entries;
}

function firstLine(value: string): string {
  return value.trim().split("\n")[0] ?? "";
}

/**
 * Turns a failed step into the refusal it really is. Git reports these on
 * stderr; no exit code distinguishes them.
 */
function classifyFailure(stderr: string): VcsHistoryActionResult | null {
  if (/already exists|is not a valid branch name/i.test(stderr)) {
    return { _tag: "blocked", reason: "ref-exists", detail: firstLine(stderr) };
  }
  if (/not fully merged/i.test(stderr)) {
    return {
      _tag: "blocked",
      reason: "unsupported",
      detail: "That branch is not fully merged. Use Force delete to remove it anyway.",
    };
  }
  if (
    /unknown revision|not a valid object name|pathspec .* did not match|couldn't find remote ref|no such ref/i.test(
      stderr,
    )
  ) {
    return { _tag: "blocked", reason: "ref-not-found", detail: firstLine(stderr) };
  }
  if (
    /does not appear to be a git repository|No such remote|Could not read from remote repository|Authentication failed|Permission denied/i.test(
      stderr,
    )
  ) {
    return { _tag: "blocked", reason: "no-remote", detail: firstLine(stderr) };
  }
  return null;
}

export interface GitHistoryActionsDeps {
  readonly runGit: RunGit;
  readonly resolvePrimaryRemoteName: (cwd: string) => Effect.Effect<string, GitCommandError>;
}

export function makeGitHistoryActions({ runGit, resolvePrimaryRemoteName }: GitHistoryActionsDeps) {
  const listStashes = Effect.fn("GitHistoryActions.listStashes")(function* (input: {
    readonly cwd: string;
  }) {
    const result = yield* runGit(
      "GitHistoryActions.listStashes",
      input.cwd,
      ["stash", "list", `--format=${STASH_LOG_FORMAT}`],
      { allowNonZeroExit: true, timeoutMs: 15_000 },
    );
    if (result.exitCode !== 0) {
      return { stashes: [], isRepo: false } satisfies VcsListStashesResult;
    }
    return { stashes: parseStashList(result.stdout), isRepo: true } satisfies VcsListStashesResult;
  });

  const runHistoryAction = Effect.fn("GitHistoryActions.runHistoryAction")(function* (input: {
    readonly cwd: string;
    readonly action: VcsHistoryAction;
  }) {
    const state = yield* readRepositoryState(runGit, input.cwd);
    const guardFailure = checkGuards(input.action, state);
    if (guardFailure !== null) return guardFailure;

    // Only resolved when the action can fall back to it, so a repository with
    // no remotes stays fully usable for every local verb.
    const needsRemote =
      (input.action._tag === "pushBranch" || input.action._tag === "pushTag") &&
      input.action.remoteName === undefined;
    const remoteName = needsRemote
      ? yield* resolvePrimaryRemoteName(input.cwd).pipe(Effect.orElseSucceed(() => null))
      : null;

    const command = buildHistoryCommand(input.action, { remoteName });
    const conflictSource = conflictSourceFor(input.action._tag);

    for (const [index, args] of command.steps.entries()) {
      const result = yield* runGit(
        `GitHistoryActions.${input.action._tag}.${index}`,
        input.cwd,
        args,
        { allowNonZeroExit: true, timeoutMs: HISTORY_ACTION_TIMEOUT_MS },
      );
      if (result.exitCode === 0) continue;

      if (conflictSource !== null) {
        const paths = yield* readConflictPaths(runGit, input.cwd);
        if (paths.length > 0 || looksLikeConflict(result.stderr, result.stdout)) {
          const rolledBack = yield* rollback(runGit, input.cwd, conflictSource);
          return {
            _tag: "conflicted",
            source: conflictSource,
            detail: rolledBack
              ? `The ${conflictSource} conflicted and was rolled back.`
              : `The ${conflictSource} conflicted and could not be rolled back automatically.`,
            paths,
            rolledBack,
          } satisfies VcsHistoryActionResult;
        }
      }

      const classified = classifyFailure(result.stderr);
      if (classified !== null) return classified;

      return yield* new GitCommandError({
        operation: `GitHistoryActions.${input.action._tag}`,
        command: "git",
        cwd: input.cwd,
        argumentCount: args.length,
        detail: firstLine(result.stderr) || "Git command exited with a non-zero status.",
        ...(result.exitCode === null ? {} : { exitCode: result.exitCode }),
        stdoutLength: result.stdout.length,
        stderrLength: result.stderr.length,
      });
    }

    const refName = command.changesHead
      ? yield* runGit("GitHistoryActions.currentBranch", input.cwd, ["branch", "--show-current"], {
          allowNonZeroExit: true,
          timeoutMs: 10_000,
        }).pipe(
          Effect.map((result) => result.stdout.trim() || null),
          Effect.orElseSucceed(() => null),
        )
      : state.headRefName;

    return { _tag: "ok", detail: command.detail, refName } satisfies VcsHistoryActionResult;
  });

  return { runHistoryAction, listStashes };
}
