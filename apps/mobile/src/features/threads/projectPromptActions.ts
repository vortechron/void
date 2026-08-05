import type { ComposerDraftWorkspaceSelection } from "../../state/use-composer-drafts";

export function appendProjectPrompt(currentPrompt: string, savedPrompt: string): string {
  if (currentPrompt.length === 0) return savedPrompt;
  return `${currentPrompt.replace(/\n*$/, "")}\n\n${savedPrompt}`;
}

export interface ProjectPromptActionNewTaskRouteParams {
  readonly environmentId: string;
  readonly projectId: string;
  readonly title: string;
  readonly promptActionId: string;
  readonly promptActionDraftKey: string;
  readonly workspaceMode: "local";
  readonly branch?: string;
  readonly worktreePath?: string;
}

export function buildProjectPromptActionNewTaskRouteParams(input: {
  readonly environmentId: string;
  readonly projectId: string;
  readonly title: string;
  readonly promptActionId: string;
  readonly promptActionDraftKey: string;
  readonly branch: string | null;
  readonly worktreePath: string | null;
}): ProjectPromptActionNewTaskRouteParams {
  return {
    environmentId: input.environmentId,
    projectId: input.projectId,
    title: input.title,
    promptActionId: input.promptActionId,
    promptActionDraftKey: input.promptActionDraftKey,
    // "worktree" mode creates another worktree. Reusing an existing path is
    // a local checkout at that path.
    workspaceMode: "local",
    ...(input.branch ? { branch: input.branch } : {}),
    ...(input.worktreePath ? { worktreePath: input.worktreePath } : {}),
  };
}

type RouteValue = string | ReadonlyArray<string> | undefined;

function firstRouteValue(value: RouteValue): string | undefined {
  return typeof value === "string" ? value : value?.[0];
}

export function resolveProjectPromptActionWorkspaceSelection(input: {
  readonly workspaceMode?: RouteValue;
  readonly branch?: RouteValue;
  readonly worktreePath?: RouteValue;
}): ComposerDraftWorkspaceSelection | undefined {
  const workspaceMode = firstRouteValue(input.workspaceMode);
  if (workspaceMode !== "local" && workspaceMode !== "worktree") return undefined;
  return {
    mode: workspaceMode,
    branch: firstRouteValue(input.branch) ?? null,
    worktreePath: firstRouteValue(input.worktreePath) ?? null,
    startFromOrigin: false,
  };
}
