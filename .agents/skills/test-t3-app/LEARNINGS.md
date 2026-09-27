# test-t3-app learnings

## 2026-09-10 — Dev server started against the developer's live data

Symptom: `vp run dev` printed `baseDir=/Users/<user>/.t3`, the live install, while the developer's own T3 Code was running against it
Cause: the worktree-local `.t3` default only applies in a linked worktree; the main checkout falls back to the ambient home
Rule: pass `--home-dir <isolated-dir>` unless you are in a linked worktree, and read the `[dev-runner]` line's `baseDir` before doing anything else

## 2026-09-17 — Full live database copy was large and schema-incompatible

Symptom: an isolated UI test copied gigabytes of live state and the dev server repeatedly failed to decode older thread messages
Cause: the test needed only a few UI fixtures, but reused the complete live event store across a branch with different persistence schemas
Rule: for focused UI tests, start with an empty isolated base directory and seed only the required projections or app records; copy live state only when its full history is essential and compatible

## 2026-09-27 — `project add` wrote to the live install from a worktree

Symptom: `node apps/server/src/bin.ts project add <path>` in a linked worktree added the project to `~/.t3/userdata`, not to the worktree `.t3` the dev server was using
Cause: unlike `pair`, the `project` subcommands do not look for the worktree `.t3`; they fall back to the shared home
Rule: pass `--base-dir <the dev-runner baseDir>` to every `bin.ts` subcommand that writes state, and confirm the change landed in that base directory
