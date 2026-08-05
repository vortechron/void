import type { ProjectActionScope, ProjectScript } from "@t3tools/contracts";

interface ProjectScriptRuntimeEnvInput {
  project: {
    cwd: string;
  };
  worktreePath?: string | null;
  extraEnv?: Record<string, string>;
}

export function projectScriptCwd(input: {
  project: {
    cwd: string;
  };
  worktreePath?: string | null;
}): string {
  return input.worktreePath ?? input.project.cwd;
}

export function projectScriptRuntimeEnv(
  input: ProjectScriptRuntimeEnvInput,
): Record<string, string> {
  const env: Record<string, string> = {
    T3CODE_PROJECT_ROOT: input.project.cwd,
  };
  if (input.worktreePath) {
    env.T3CODE_WORKTREE_PATH = input.worktreePath;
  }
  if (input.extraEnv) {
    return { ...env, ...input.extraEnv };
  }
  return env;
}

/** One action paired with the store it came from. */
export interface ScopedProjectAction<T> {
  readonly scope: ProjectActionScope;
  readonly action: T;
}

/** The two stores an action can live in, for one action type. */
export interface ProjectActionsByScope<T> {
  readonly project?: readonly T[] | undefined;
  readonly global?: readonly T[] | undefined;
}

/**
 * Merge a project's own actions with the server's global ones.
 *
 * Project entries come first, which is what makes project-first lookups —
 * `setupProjectScript`, keybinding dispatch, the primary-action pick — resolve
 * to the project's own action when both scopes define one. Command actions and
 * prompt actions share this, so the two stay in the same order.
 */
export function scopedActions<T>(
  input: ProjectActionsByScope<T>,
): ReadonlyArray<ScopedProjectAction<T>> {
  return [
    ...(input.project ?? []).map((action) => ({ scope: "project", action }) as const),
    ...(input.global ?? []).map((action) => ({ scope: "global", action }) as const),
  ];
}

/** `scopedActions` without the scope tags, in the same project-first order. */
export function mergedActions<T>(input: ProjectActionsByScope<T>): ReadonlyArray<T> {
  return scopedActions(input).map((entry) => entry.action);
}

/**
 * The action to run when a worktree is created.
 *
 * Takes the merged list so a project that defines its own setup action shadows
 * the global one rather than running both.
 */
export function setupProjectScript(scripts: readonly ProjectScript[]): ProjectScript | null {
  return scripts.find((script) => script.runOnWorktreeCreate) ?? null;
}
