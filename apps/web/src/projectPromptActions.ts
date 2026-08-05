import type { ModelSelection, ProjectPromptAction, ProjectScriptIcon } from "@t3tools/contracts";

export interface ProjectPromptActionInput {
  readonly name: string;
  readonly prompt: string;
  readonly icon: ProjectScriptIcon;
  readonly modelSelection: ModelSelection;
}

export function buildProjectPromptAction(
  id: string,
  input: ProjectPromptActionInput,
): ProjectPromptAction {
  return {
    id,
    name: input.name,
    prompt: input.prompt,
    icon: input.icon,
    modelSelection: input.modelSelection,
  };
}

export function appendProjectPrompt(currentPrompt: string, savedPrompt: string): string {
  if (currentPrompt.length === 0) return savedPrompt;
  return `${currentPrompt.replace(/\n*$/, "")}\n\n${savedPrompt}`;
}
