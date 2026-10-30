import type {
  ProjectActionScope,
  ProjectId,
  ProjectScript,
  ServerSettings,
} from "@t3tools/contracts";

type ProjectScriptSettings = Pick<
  ServerSettings,
  | "defaultProjectScripts"
  | "projectScriptOverrides"
  | "projectSettingsOverrides"
  | "projectSettingsFolded"
>;

export function resolveProjectScripts(
  settings: ProjectScriptSettings,
  project: { id: ProjectId; scripts: readonly ProjectScript[] },
): readonly ProjectScript[] {
  const override = settings.projectSettingsOverrides[project.id]?.defaultProjectScripts;
  if (override !== undefined) return override;
  if (settings.projectSettingsFolded) return settings.defaultProjectScripts;
  const legacy = settings.projectScriptOverrides[project.id];
  if (legacy === null) return settings.defaultProjectScripts;
  return legacy ?? (project.scripts.length > 0 ? project.scripts : settings.defaultProjectScripts);
}

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

export function projectScriptMenuLabel(script: ProjectScript): string {
  const roles = [
    ...(script.runOnWorktreeCreate ? ["setup"] : []),
    ...(script.runOnSettle ? ["on settle"] : []),
  ];
  return roles.length === 0 ? script.name : `${script.name} (${roles.join(", ")})`;
}

export function settleProjectScript(scripts: readonly ProjectScript[]): ProjectScript | null {
  return scripts.find((script) => script.runOnSettle === true) ?? null;
}

/**
 * Leading spaces omit scripts from Bash history with ignorespace/ignoreboth,
 * zsh with HIST_IGNORE_SPACE, and fish. Only the first line is prefixed, so later
 * entries from multiline input may still enter history. PowerShell/PSReadLine history is not suppressed.
 */
export function projectScriptTerminalInput(command: string): string {
  return ` ${command}\r`;
}
