# test-t3-app learnings

## 2026-09-10 — Dev server started against the developer's live data

Symptom: `vp run dev` printed `baseDir=/Users/<user>/.t3`, the live install, while the developer's own T3 Code was running against it
Cause: the worktree-local `.t3` default only applies in a linked worktree; the main checkout falls back to the ambient home
Rule: pass `--home-dir <isolated-dir>` unless you are in a linked worktree, and read the `[dev-runner]` line's `baseDir` before doing anything else
