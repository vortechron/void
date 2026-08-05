import {
  type EnvironmentId,
  type EditorId,
  type ModelSelection,
  type ProjectActionScope,
  type ProjectPromptAction,
  type ProjectScript,
  type ResolvedKeybindingsConfig,
  type ServerProvider,
  type ThreadId,
} from "@t3tools/contracts";
import type { UnifiedSettings } from "@t3tools/contracts/settings";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { memo } from "react";
import GitActionsControl from "../GitActionsControl";
import { type DraftId } from "~/composerDraftStore";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import ProjectScriptsControl, {
  type NewProjectScriptInput,
  type NewProjectPromptActionInput,
  type ProjectPromptActionDestination,
  type ProjectScriptActionResult,
} from "../ProjectScriptsControl";
import type { ProjectActionScopeChange } from "~/projectActionScopes";
import { OpenInPicker } from "./OpenInPicker";
import { usePrimaryEnvironmentId } from "../../state/environments";
import { useT3ProjectFileScripts } from "~/hooks/useT3ProjectFileScripts";
import { ProjectFavicon } from "../ProjectFavicon";
import { cn } from "~/lib/utils";

interface ChatHeaderProps {
  activeThreadEnvironmentId: EnvironmentId;
  activeThreadId: ThreadId;
  draftId?: DraftId;
  activeThreadTitle: string;
  activeProjectName: string | undefined;
  activeProjectCwd: string | null;
  openInCwd: string | null;
  activeProjectScripts: ReadonlyArray<ProjectScript> | undefined;
  activeProjectPromptActions: ReadonlyArray<ProjectPromptAction> | undefined;
  promptActionsSupported: boolean;
  globalScripts: ReadonlyArray<ProjectScript>;
  globalPromptActions: ReadonlyArray<ProjectPromptAction>;
  globalActionsSupported: boolean;
  providerStatuses: ReadonlyArray<ServerProvider>;
  settings: UnifiedSettings;
  preferredScriptId: string | null;
  keybindings: ResolvedKeybindingsConfig;
  availableEditors: ReadonlyArray<EditorId>;
  rightPanelOpen: boolean;
  gitCwd: string | null;
  onNewThreadInProject: () => void;
  onRunProjectScript: (script: ProjectScript) => void;
  onAddProjectScript: (
    input: NewProjectScriptInput,
    scope: ProjectActionScope,
  ) => Promise<ProjectScriptActionResult>;
  onUpdateProjectScript: (
    scriptId: string,
    input: NewProjectScriptInput,
    scopeChange: ProjectActionScopeChange,
  ) => Promise<ProjectScriptActionResult>;
  onDeleteProjectScript: (
    scriptId: string,
    scope: ProjectActionScope,
  ) => Promise<ProjectScriptActionResult>;
  getCurrentModelSelection: () => ModelSelection | null;
  getPromptActionDisabledReason: (
    action: ProjectPromptAction,
    destination: ProjectPromptActionDestination,
  ) => string | null;
  onUseProjectPromptAction: (
    action: ProjectPromptAction,
    destination: ProjectPromptActionDestination,
  ) => void;
  onAddProjectPromptAction: (
    input: NewProjectPromptActionInput,
    scope: ProjectActionScope,
  ) => Promise<ProjectScriptActionResult>;
  onUpdateProjectPromptAction: (
    actionId: string,
    input: NewProjectPromptActionInput,
    scopeChange: ProjectActionScopeChange,
  ) => Promise<ProjectScriptActionResult>;
  onDeleteProjectPromptAction: (
    actionId: string,
    scope: ProjectActionScope,
  ) => Promise<ProjectScriptActionResult>;
}

export function shouldShowOpenInPicker(input: {
  readonly activeProjectName: string | undefined;
  readonly activeThreadEnvironmentId: EnvironmentId;
  readonly primaryEnvironmentId: EnvironmentId | null;
}): boolean {
  return (
    Boolean(input.activeProjectName) &&
    input.primaryEnvironmentId !== null &&
    input.activeThreadEnvironmentId === input.primaryEnvironmentId
  );
}

export const ChatHeader = memo(function ChatHeader({
  activeThreadEnvironmentId,
  activeThreadId,
  draftId,
  activeThreadTitle,
  activeProjectName,
  activeProjectCwd,
  openInCwd,
  activeProjectScripts,
  activeProjectPromptActions,
  promptActionsSupported,
  globalScripts,
  globalPromptActions,
  globalActionsSupported,
  providerStatuses,
  settings,
  preferredScriptId,
  keybindings,
  availableEditors,
  rightPanelOpen,
  gitCwd,
  onNewThreadInProject,
  onRunProjectScript,
  onAddProjectScript,
  onUpdateProjectScript,
  onDeleteProjectScript,
  getCurrentModelSelection,
  getPromptActionDisabledReason,
  onUseProjectPromptAction,
  onAddProjectPromptAction,
  onUpdateProjectPromptAction,
  onDeleteProjectPromptAction,
}: ChatHeaderProps) {
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const fileScripts = useT3ProjectFileScripts(
    activeThreadEnvironmentId,
    activeProjectScripts ? activeProjectCwd : null,
  );
  const showOpenInPicker = shouldShowOpenInPicker({
    activeProjectName,
    activeThreadEnvironmentId,
    primaryEnvironmentId,
  });
  return (
    <div className="@container/header-actions flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden sm:gap-3">
        {/* The project always leads the header: knowing which project a
            thread lives in is priority zero, and the thread title alone
            doesn't answer it. */}
        {activeProjectName ? (
          <span className="inline-flex shrink-0 items-center gap-2">
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    aria-label={`New thread in ${activeProjectName}`}
                    onClick={onNewThreadInProject}
                    className="inline-flex min-w-0 cursor-pointer items-center gap-1.5 rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
                  />
                }
              >
                <ProjectFavicon
                  environmentId={activeThreadEnvironmentId}
                  cwd={activeProjectCwd ?? ""}
                  className="size-3.5"
                />
                <span className="max-w-40 truncate text-sm font-medium">{activeProjectName}</span>
              </TooltipTrigger>
              <TooltipPopup side="top">New thread in {activeProjectName}</TooltipPopup>
            </Tooltip>
            <span aria-hidden className="text-muted-foreground/40">
              /
            </span>
          </span>
        ) : null}
        <Tooltip>
          <TooltipTrigger
            render={
              <h2
                aria-label={activeThreadTitle}
                className="min-w-0 flex-1 truncate text-sm font-medium text-foreground"
              >
                {activeThreadTitle}
              </h2>
            }
          />
          <TooltipPopup side="top">{activeThreadTitle}</TooltipPopup>
        </Tooltip>
      </div>
      <div
        data-chat-header-actions
        className={cn(
          "flex shrink-0 items-center justify-end gap-2 @3xl/header-actions:gap-3",
          rightPanelOpen ? "pr-0" : "pr-16",
        )}
      >
        {activeProjectScripts && (
          <ProjectScriptsControl
            scripts={activeProjectScripts}
            promptActions={activeProjectPromptActions ?? []}
            promptActionsSupported={promptActionsSupported}
            globalScripts={globalScripts}
            globalPromptActions={globalPromptActions}
            globalActionsSupported={globalActionsSupported}
            fileScripts={fileScripts}
            keybindings={keybindings}
            providerStatuses={providerStatuses}
            settings={settings}
            preferredScriptId={preferredScriptId}
            onRunScript={onRunProjectScript}
            onAddScript={onAddProjectScript}
            onUpdateScript={onUpdateProjectScript}
            onDeleteScript={onDeleteProjectScript}
            getCurrentModelSelection={getCurrentModelSelection}
            getPromptActionDisabledReason={getPromptActionDisabledReason}
            onUsePromptAction={onUseProjectPromptAction}
            onAddPromptAction={onAddProjectPromptAction}
            onUpdatePromptAction={onUpdateProjectPromptAction}
            onDeletePromptAction={onDeleteProjectPromptAction}
          />
        )}
        {showOpenInPicker && (
          <OpenInPicker
            environmentId={activeThreadEnvironmentId}
            keybindings={keybindings}
            availableEditors={availableEditors}
            openInCwd={openInCwd}
          />
        )}
        {activeProjectName && (
          <GitActionsControl
            gitCwd={gitCwd}
            activeThreadRef={scopeThreadRef(activeThreadEnvironmentId, activeThreadId)}
            {...(draftId ? { draftId } : {})}
          />
        )}
      </div>
    </div>
  );
});
