import type {
  EnvironmentId,
  KeybindingCommand,
  ProjectActionScope,
  ProjectPromptAction,
  ProjectScript,
} from "@t3tools/contracts";
import { AuthSettingsWriteScope, EnvironmentAuthorizationError } from "@t3tools/contracts";
import type { UnifiedSettings } from "@t3tools/contracts/settings";
import {
  isAtomCommandInterrupted,
  mapAtomCommandResult,
  squashAtomCommandFailure,
  type AtomCommandResult,
} from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/shell";
import * as Cause from "effect/Cause";
import { AsyncResult } from "effect/reactivity";
import { useStableCallback } from "../../hooks/useStableCallback";
import { decodeProjectScriptKeybindingRule } from "../../lib/projectScriptKeybindings";
import type { applyProviderInstanceSettings } from "../../providerInstances";
import { getAppModelOptionsForInstance } from "../../modelSelection";
import {
  moveProjectAction,
  upsertById,
  type ProjectActionScopeChange,
} from "../../projectActionScopes";
import { buildProjectPromptAction } from "../../projectPromptActions";
import {
  buildProjectScript,
  commandForProjectScript,
  nextProjectScriptId,
  withScriptUpsert,
} from "../../projectScripts";
import { appAtomRegistry } from "../../rpc/atomRegistry";
import { projectEnvironment } from "../../state/projects";
import { serverEnvironment } from "../../state/server";
import { readEnvironmentScope } from "../../state/session";
import { useAtomCommand } from "../../state/use-atom-command";
import {
  type deriveLockedProvider,
  getStartedThreadModelChangeBlockReason,
} from "../ChatView.logic";
import type {
  NewProjectPromptActionInput,
  NewProjectScriptInput,
  ProjectPromptActionDestination,
} from "../ProjectScriptsControl";
import { stackedThreadToast, toastManager } from "../ui/toast";

const NO_GLOBAL_SCRIPTS: ReadonlyArray<ProjectScript> = [];
const NO_GLOBAL_PROMPT_ACTIONS: ReadonlyArray<ProjectPromptAction> = [];

/** Why a saved prompt action cannot run here, or null when it can. */
export function makeProjectPromptActionDisabledReason(input: {
  readonly configuredProviderEntries: ReturnType<typeof applyProviderInstanceSettings>;
  readonly settings: Parameters<typeof getAppModelOptionsForInstance>[0];
  readonly lockedProvider: ReturnType<typeof deriveLockedProvider>;
  readonly modelChangeContext: Omit<
    Parameters<typeof getStartedThreadModelChangeBlockReason>[0],
    "nextModelSelection"
  > | null;
}) {
  return (
    action: ProjectPromptAction,
    destination: ProjectPromptActionDestination,
  ): string | null => {
    const { configuredProviderEntries, lockedProvider, modelChangeContext } = input;
    const providerEntry = configuredProviderEntries.find(
      (entry) => entry.instanceId === action.modelSelection.instanceId,
    );
    if (!providerEntry || !providerEntry.enabled || !providerEntry.isAvailable) {
      return "The saved provider is unavailable.";
    }
    const modelAvailable = getAppModelOptionsForInstance(input.settings, providerEntry).some(
      (model) => model.slug === action.modelSelection.model,
    );
    if (!modelAvailable) {
      return "The saved model is unavailable for this provider.";
    }
    if (destination === "new" || !modelChangeContext) {
      return null;
    }
    if (lockedProvider !== null && providerEntry.driverKind !== lockedProvider) {
      return "This chat is locked to its current provider. Open the prompt in a new chat.";
    }
    const currentProviderInstanceId = modelChangeContext.currentProviderInstanceId;
    const currentProviderEntry = currentProviderInstanceId
      ? configuredProviderEntries.find((entry) => entry.instanceId === currentProviderInstanceId)
      : null;
    if (
      currentProviderEntry?.continuationGroupKey &&
      providerEntry.continuationGroupKey &&
      currentProviderEntry.continuationGroupKey !== providerEntry.continuationGroupKey
    ) {
      return "This model is not compatible with the current provider session. Open it in a new chat.";
    }
    const blockReason = getStartedThreadModelChangeBlockReason({
      ...modelChangeContext,
      nextModelSelection: action.modelSelection,
    });
    return blockReason ? `${blockReason.description} Open the prompt in a new chat.` : null;
  };
}

/**
 * Void: adds, edits, moves, and deletes the active project's actions, both
 * command scripts and saved prompts, in either scope: the project, or
 * settings.json for global actions every project shares. It replaces
 * upstream's `useProjectScriptEditing`, which only knows project scripts.
 * See docs/void/FORK.md, "Project and global prompt actions".
 */
export function useProjectActionEditing(input: {
  readonly environmentId: EnvironmentId;
  readonly project: EnvironmentProject | null;
  readonly settings: UnifiedSettings;
  readonly globalActionsSupported: boolean;
  readonly promptActionsSupported: boolean;
}) {
  const { environmentId, project, settings, globalActionsSupported, promptActionsSupported } =
    input;
  // Prompt actions still live on the project row; only command scripts moved
  // into settings.json as `projectScriptOverrides`.
  const updateProject = useAtomCommand(projectEnvironment.update, { reportFailure: false });
  // Global actions live in settings.json. The command is used directly rather
  // than through `useUpdateEnvironmentSettings` because the action dialog needs
  // the write's result to report failure and to know a scope move landed.
  const updateServerSettings = useAtomCommand(serverEnvironment.updateSettings, {
    reportFailure: false,
  });
  const upsertKeybinding = useAtomCommand(serverEnvironment.upsertKeybinding, {
    reportFailure: false,
  });

  // A server without the capability may still be sending decoded defaults, so
  // pin the lists to empty rather than rendering actions we could never write.
  const globalScripts = globalActionsSupported ? settings.globalScripts : NO_GLOBAL_SCRIPTS;
  const globalPromptActions = globalActionsSupported
    ? settings.globalPromptActions
    : NO_GLOBAL_PROMPT_ACTIONS;

  const reportOrphanedActionCopy = (copy: { title: string; description: string }) => {
    toastManager.add(stackedThreadToast({ type: "error", ...copy }));
  };

  /** Replace one scope's whole command-action list. */
  const writeScriptsForScope = async (
    scope: ProjectActionScope,
    nextScripts: ReadonlyArray<ProjectScript>,
  ): Promise<AtomCommandResult<void, unknown>> => {
    if (scope === "global") {
      if (!globalActionsSupported) {
        return AsyncResult.failure(
          Cause.fail(new Error("This server does not support global actions.")),
        );
      }
      return mapAtomCommandResult(
        await updateServerSettings({
          environmentId,
          input: { patch: { globalScripts: nextScripts } },
        }),
        () => undefined,
      );
    }
    if (!project) {
      return AsyncResult.success(undefined);
    }
    const serverConfig = appAtomRegistry.get(serverEnvironment.configValueAtom(environmentId));
    return mapAtomCommandResult(
      await updateServerSettings({
        environmentId,
        input: {
          // The canonical key on servers that understand it; the legacy
          // per-project map is still translated on older ones.
          patch:
            serverConfig?.environment.capabilities.projectSettingsOverrides === true
              ? {
                  projectSettingsOverrides: {
                    [project.id]: {
                      ...settings.projectSettingsOverrides[project.id],
                      defaultProjectScripts: nextScripts,
                    },
                  },
                }
              : { projectScriptOverrides: { [project.id]: nextScripts } },
        },
      }),
      () => undefined,
    );
  };

  /**
   * Point a command action's keybinding rule at its id.
   *
   * Kept apart from the list write so a scope move can apply it once, after
   * both halves of the move have landed.
   */
  const applyScriptKeybinding = async (keybindingInput: {
    keybinding: NewProjectScriptInput["keybinding"];
    keybindingCommand: KeybindingCommand | null;
  }): Promise<AtomCommandResult<void, unknown>> => {
    // `undefined` means the editor could not touch keybindings: leave the rule alone.
    if (!keybindingInput.keybindingCommand || keybindingInput.keybinding === undefined) {
      return AsyncResult.success(undefined);
    }
    const keybindingRule = decodeProjectScriptKeybindingRule({
      keybinding: keybindingInput.keybinding,
      command: keybindingInput.keybindingCommand,
    });
    if (!keybindingRule) {
      return AsyncResult.success(undefined);
    }
    if (!readEnvironmentScope(environmentId, AuthSettingsWriteScope)) {
      return AsyncResult.failure(
        Cause.fail(
          new EnvironmentAuthorizationError({
            requiredScope: AuthSettingsWriteScope,
            message: "The action was saved, but this connection cannot change keyboard shortcuts.",
          }),
        ),
      );
    }
    return mapAtomCommandResult(
      await upsertKeybinding({ environmentId, input: keybindingRule }),
      () => undefined,
    );
  };

  /** The ordinary single-scope save: list first, then the keybinding. */
  const saveScriptsForScope = async (
    scope: ProjectActionScope,
    saveInput: {
      nextScripts: ReadonlyArray<ProjectScript>;
      keybinding: NewProjectScriptInput["keybinding"];
      keybindingCommand: KeybindingCommand | null;
    },
  ): Promise<AtomCommandResult<void, unknown>> => {
    const writeResult = await writeScriptsForScope(scope, saveInput.nextScripts);
    if (writeResult._tag === "Failure") {
      return writeResult;
    }
    return applyScriptKeybinding(saveInput);
  };

  /** Every action id in use, so a new id is unique across scopes and types. */
  const takenActionIds = [
    ...(project?.scripts ?? []).map((script) => script.id),
    ...(project?.promptActions ?? []).map((action) => action.id),
    ...globalScripts.map((script) => script.id),
    ...globalPromptActions.map((action) => action.id),
  ];

  const saveProjectScript = async (
    scriptInput: NewProjectScriptInput,
    scope: ProjectActionScope,
  ): Promise<AtomCommandResult<void, unknown>> => {
    if (!project) {
      return AsyncResult.success(undefined);
    }
    const nextId = nextProjectScriptId(scriptInput.name, takenActionIds);
    const nextScript = buildProjectScript(nextId, scriptInput);
    const currentScripts = scope === "global" ? globalScripts : project.scripts;

    return saveScriptsForScope(scope, {
      nextScripts: withScriptUpsert(currentScripts, nextScript),
      keybinding: scriptInput.keybinding,
      keybindingCommand: commandForProjectScript(nextId),
    });
  };

  const updateProjectScript = async (
    scriptId: string,
    scriptInput: NewProjectScriptInput,
    scopeChange: ProjectActionScopeChange,
  ): Promise<AtomCommandResult<void, unknown>> => {
    if (!project) {
      return AsyncResult.success(undefined);
    }
    const sourceScripts = scopeChange.from === "global" ? globalScripts : project.scripts;
    const existingScript = sourceScripts.find((script) => script.id === scriptId);
    if (!existingScript) {
      return AsyncResult.failure(Cause.fail(new Error("Script not found.")));
    }

    const updatedScript = buildProjectScript(existingScript.id, scriptInput);
    const keybindingCommand = commandForProjectScript(scriptId);
    const destinationScripts = scopeChange.to === "global" ? globalScripts : project.scripts;
    const nextScripts = withScriptUpsert(destinationScripts, updatedScript);

    if (scopeChange.from === scopeChange.to) {
      return saveScriptsForScope(scopeChange.to, {
        nextScripts,
        keybinding: scriptInput.keybinding,
        keybindingCommand,
      });
    }

    const moveResult = await moveProjectAction({
      name: updatedScript.name,
      writeDestination: () => writeScriptsForScope(scopeChange.to, nextScripts),
      removeSource: () =>
        writeScriptsForScope(
          scopeChange.from,
          sourceScripts.filter((script) => script.id !== scriptId),
        ),
      reportOrphan: reportOrphanedActionCopy,
    });
    if (moveResult._tag === "Failure") {
      return moveResult;
    }
    // The id survives the move, so the rule still points at the right action.
    return applyScriptKeybinding({ keybinding: scriptInput.keybinding, keybindingCommand });
  };

  const deleteProjectScript = async (
    scriptId: string,
    scope: ProjectActionScope,
  ): Promise<AtomCommandResult<void, unknown>> => {
    if (!project) {
      return AsyncResult.success(undefined);
    }
    const currentScripts = scope === "global" ? globalScripts : project.scripts;
    const deletedName = currentScripts.find((script) => script.id === scriptId)?.name;

    const result = await saveScriptsForScope(scope, {
      nextScripts: currentScripts.filter((script) => script.id !== scriptId),
      keybinding: null,
      keybindingCommand: commandForProjectScript(scriptId),
    });
    if (result._tag === "Success") {
      toastManager.add({
        type: "success",
        title: `Deleted action "${deletedName ?? "Unknown"}"`,
      });
    } else if (!isAtomCommandInterrupted(result)) {
      const error = squashAtomCommandFailure(result);
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: "Could not delete action",
          description: error instanceof Error ? error.message : "An unexpected error occurred.",
        }),
      );
    }
    return result;
  };

  /** Replace one scope's whole prompt-action list. */
  const writePromptActionsForScope = async (
    scope: ProjectActionScope,
    promptActions: ReadonlyArray<ProjectPromptAction>,
  ): Promise<AtomCommandResult<void, unknown>> => {
    if (scope === "global") {
      if (!globalActionsSupported) {
        return AsyncResult.failure(
          Cause.fail(new Error("This server does not support global actions.")),
        );
      }
      return mapAtomCommandResult(
        await updateServerSettings({
          environmentId,
          input: { patch: { globalPromptActions: promptActions } },
        }),
        () => undefined,
      );
    }
    if (!promptActionsSupported) {
      return AsyncResult.failure(
        Cause.fail(new Error("This server does not support prompt actions.")),
      );
    }
    if (!project) {
      return AsyncResult.success(undefined);
    }
    return mapAtomCommandResult(
      await updateProject({
        environmentId,
        input: { projectId: project.id, promptActions },
      }),
      () => undefined,
    );
  };

  const saveProjectPromptAction = async (
    actionInput: NewProjectPromptActionInput,
    scope: ProjectActionScope,
  ): Promise<AtomCommandResult<void, unknown>> => {
    if (!project) return AsyncResult.success(undefined);
    const nextId = nextProjectScriptId(actionInput.name, takenActionIds);
    const currentPromptActions =
      scope === "global" ? globalPromptActions : (project.promptActions ?? []);
    return writePromptActionsForScope(
      scope,
      upsertById(currentPromptActions, buildProjectPromptAction(nextId, actionInput)),
    );
  };

  const updateProjectPromptAction = async (
    actionId: string,
    actionInput: NewProjectPromptActionInput,
    scopeChange: ProjectActionScopeChange,
  ): Promise<AtomCommandResult<void, unknown>> => {
    if (!project) return AsyncResult.success(undefined);
    const sourcePromptActions =
      scopeChange.from === "global" ? globalPromptActions : (project.promptActions ?? []);
    if (!sourcePromptActions.some((action) => action.id === actionId)) {
      return AsyncResult.failure(Cause.fail(new Error("Prompt action not found.")));
    }
    const updatedAction = buildProjectPromptAction(actionId, actionInput);
    const destinationPromptActions =
      scopeChange.to === "global" ? globalPromptActions : (project.promptActions ?? []);

    const nextPromptActions = upsertById(destinationPromptActions, updatedAction);

    if (scopeChange.from === scopeChange.to) {
      return writePromptActionsForScope(scopeChange.to, nextPromptActions);
    }

    return moveProjectAction({
      name: updatedAction.name,
      writeDestination: () => writePromptActionsForScope(scopeChange.to, nextPromptActions),
      removeSource: () =>
        writePromptActionsForScope(
          scopeChange.from,
          sourcePromptActions.filter((action) => action.id !== actionId),
        ),
      reportOrphan: reportOrphanedActionCopy,
    });
  };

  const deleteProjectPromptAction = async (
    actionId: string,
    scope: ProjectActionScope,
  ): Promise<AtomCommandResult<void, unknown>> => {
    if (!project) return AsyncResult.success(undefined);
    const currentPromptActions =
      scope === "global" ? globalPromptActions : (project.promptActions ?? []);
    const deletedName = currentPromptActions.find((action) => action.id === actionId)?.name;
    const result = await writePromptActionsForScope(
      scope,
      currentPromptActions.filter((action) => action.id !== actionId),
    );
    if (result._tag === "Success") {
      toastManager.add({
        type: "success",
        title: `Deleted prompt action "${deletedName ?? "Unknown"}"`,
      });
    } else if (!isAtomCommandInterrupted(result)) {
      const error = squashAtomCommandFailure(result);
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: "Could not delete prompt action",
          description: error instanceof Error ? error.message : "An unexpected error occurred.",
        }),
      );
    }
    return result;
  };

  return {
    globalScripts,
    globalPromptActions,
    saveProjectScript: useStableCallback(saveProjectScript),
    updateProjectScript: useStableCallback(updateProjectScript),
    deleteProjectScript: useStableCallback(deleteProjectScript),
    saveProjectPromptAction: useStableCallback(saveProjectPromptAction),
    updateProjectPromptAction: useStableCallback(updateProjectPromptAction),
    deleteProjectPromptAction: useStableCallback(deleteProjectPromptAction),
  };
}
