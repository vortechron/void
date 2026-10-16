import { ThreadDetailsControl } from "./chat/ThreadDetailsControl";
import {
  AuthSettingsWriteScope,
  type EnvironmentId,
  type ModelSelection,
  type ProjectActionScope,
  type ProjectPromptAction,
  type ProjectScript,
  type ProjectScriptIcon,
  type ServerProvider,
  type T3ProjectFileScript,
} from "@t3tools/contracts";
import type { UnifiedSettings } from "@t3tools/contracts/settings";
import { useAtomValue } from "@effect/atom-react";
import { DEFAULT_RESOLVED_KEYBINDINGS } from "@t3tools/shared/keybindings";
import { createModelSelection } from "@t3tools/shared/model";
import { mergedActions, projectScriptMenuLabel } from "@t3tools/shared/projectScripts";
import type { ProjectActionScopeChange } from "~/projectActionScopes";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
  type AtomCommandResult,
} from "@t3tools/client-runtime/state/runtime";
import {
  BugIcon,
  ChevronDownIcon,
  DownloadIcon,
  FlaskConicalIcon,
  HammerIcon,
  ListChecksIcon,
  MessageSquareTextIcon,
  PlayIcon,
  PlusIcon,
  SettingsIcon,
  WrenchIcon,
} from "lucide-react";
import React, { type FormEvent, type KeyboardEvent, useCallback, useMemo, useState } from "react";

import {
  keybindingValueForCommand,
  decodeProjectScriptKeybindingRule,
} from "~/lib/projectScriptKeybindings";
import { keybindingFromKeyboardEvent } from "~/components/settings/KeybindingsSettings.logic";
import {
  commandForProjectScript,
  importableFileScripts,
  nextProjectScriptId,
  primaryProjectScript,
} from "~/projectScripts";
import { getAppModelOptionsForInstance } from "~/modelSelection";
import {
  applyProviderInstanceSettings,
  deriveProviderInstanceEntries,
  sortProviderInstanceEntries,
} from "~/providerInstances";
import { ProviderModelPicker } from "./chat/ProviderModelPicker";
import { TraitsPicker } from "./chat/TraitsPicker";
import { shortcutLabelForCommand } from "~/keybindings";
import { serverEnvironment } from "~/state/server";
import { readEnvironmentScope } from "~/state/session";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "./ui/alert-dialog";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "./ui/dialog";
import { Group, GroupSeparator } from "./ui/group";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuItemLabel,
  MenuPopup,
  MenuSeparator,
  MenuShortcut,
  MenuSub,
  MenuSubPopup,
  MenuSubTrigger,
  MenuTrigger,
} from "./ui/menu";
import { Popover, PopoverPopup, PopoverTrigger } from "./ui/popover";
import { Switch } from "./ui/switch";
import { Textarea } from "./ui/textarea";
import { Tooltip, TooltipPopup, TooltipTrigger } from "./ui/tooltip";
import { cn } from "~/lib/utils";
import {
  THREAD_DETAILS_PANEL_CHEVRON_CLASS,
  THREAD_DETAILS_PANEL_ICON_CLASS,
  THREAD_DETAILS_PANEL_LABEL_CLASS,
  THREAD_DETAILS_PANEL_SPLIT_GROUP_CLASS,
  THREAD_DETAILS_PANEL_SPLIT_SEPARATOR_CLASS,
} from "./chat/threadDetailsPanelStyles";

const SCRIPT_ICONS: Array<{ id: ProjectScriptIcon; label: string }> = [
  { id: "play", label: "Play" },
  { id: "test", label: "Test" },
  { id: "lint", label: "Lint" },
  { id: "configure", label: "Configure" },
  { id: "build", label: "Build" },
  { id: "debug", label: "Debug" },
];

function ScriptIcon({
  icon,
  className = "size-3.5",
}: {
  icon: ProjectScriptIcon;
  className?: string;
}) {
  if (icon === "test") return <FlaskConicalIcon className={className} />;
  if (icon === "lint") return <ListChecksIcon className={className} />;
  if (icon === "configure") return <WrenchIcon className={className} />;
  if (icon === "build") return <HammerIcon className={className} />;
  if (icon === "debug") return <BugIcon className={className} />;
  return <PlayIcon className={className} />;
}

import type { NewProjectScriptInput } from "./projectScriptEditor";

export type { NewProjectScriptInput } from "./projectScriptEditor";

export interface NewProjectPromptActionInput {
  name: string;
  prompt: string;
  icon: ProjectScriptIcon;
  modelSelection: ModelSelection;
}

export type ProjectPromptActionDestination = "current" | "new";

export type ProjectScriptActionResult = AtomCommandResult<void, unknown>;

const NO_FILE_SCRIPTS: ReadonlyArray<T3ProjectFileScript> = [];
const NO_SCRIPTS: ReadonlyArray<ProjectScript> = [];
const NO_PROMPT_ACTIONS: ReadonlyArray<ProjectPromptAction> = [];

interface ProjectScriptsControlProps {
  displayMode?: "toolbar" | "panel";
  presentation?: "toolbar" | "menu";
  onRequestMenuClose?: () => void;
  environmentId: EnvironmentId;
  scripts: ReadonlyArray<ProjectScript>;
  promptActions?: ReadonlyArray<ProjectPromptAction>;
  promptActionsSupported?: boolean;
  /** Actions from settings.json, shared by every project on this server. */
  globalScripts?: ReadonlyArray<ProjectScript>;
  globalPromptActions?: ReadonlyArray<ProjectPromptAction>;
  /** Hides the scope selector when the server cannot persist global actions. */
  globalActionsSupported?: boolean;
  fileScripts?: ReadonlyArray<T3ProjectFileScript>;
  providerStatuses?: ReadonlyArray<ServerProvider>;
  settings?: UnifiedSettings;
  preferredScriptId?: string | null;
  onRunScript?: ((script: ProjectScript) => void) | undefined;
  onAddScript: (
    input: NewProjectScriptInput,
    scope: ProjectActionScope,
  ) => Promise<ProjectScriptActionResult>;
  onUpdateScript: (
    scriptId: string,
    input: NewProjectScriptInput,
    scopeChange: ProjectActionScopeChange,
  ) => Promise<ProjectScriptActionResult>;
  onDeleteScript: (
    scriptId: string,
    scope: ProjectActionScope,
  ) => Promise<ProjectScriptActionResult>;
  getCurrentModelSelection?: () => ModelSelection | null;
  getPromptActionDisabledReason?: (
    action: ProjectPromptAction,
    destination: ProjectPromptActionDestination,
  ) => string | null;
  onUsePromptAction?: (
    action: ProjectPromptAction,
    destination: ProjectPromptActionDestination,
  ) => void;
  onAddPromptAction?: (
    input: NewProjectPromptActionInput,
    scope: ProjectActionScope,
  ) => Promise<ProjectScriptActionResult>;
  onUpdatePromptAction?: (
    actionId: string,
    input: NewProjectPromptActionInput,
    scopeChange: ProjectActionScopeChange,
  ) => Promise<ProjectScriptActionResult>;
  onDeletePromptAction?: (
    actionId: string,
    scope: ProjectActionScope,
  ) => Promise<ProjectScriptActionResult>;
}

/** The script handlers a host wires to this control. */
export type ProjectScriptHandlers = Pick<
  ProjectScriptsControlProps,
  "onRunScript" | "onAddScript" | "onUpdateScript" | "onDeleteScript"
>;

/** Void: the prompt- and global-action props a host passes through unchanged. */
export type ProjectPromptActionControlProps = Pick<
  ProjectScriptsControlProps,
  | "promptActions"
  | "promptActionsSupported"
  | "globalScripts"
  | "globalPromptActions"
  | "globalActionsSupported"
  | "providerStatuses"
  | "settings"
  | "getCurrentModelSelection"
  | "getPromptActionDisabledReason"
  | "onUsePromptAction"
  | "onAddPromptAction"
  | "onUpdatePromptAction"
  | "onDeletePromptAction"
>;

export default function ProjectScriptsControl({
  displayMode = "toolbar",
  presentation = "toolbar",
  onRequestMenuClose,
  environmentId,
  scripts,
  promptActions = NO_PROMPT_ACTIONS,
  promptActionsSupported = false,
  globalScripts = NO_SCRIPTS,
  globalPromptActions = NO_PROMPT_ACTIONS,
  globalActionsSupported = false,
  fileScripts = NO_FILE_SCRIPTS,
  providerStatuses = [],
  settings,
  preferredScriptId = null,
  onRunScript,
  onAddScript,
  onUpdateScript,
  onDeleteScript,
  getCurrentModelSelection,
  getPromptActionDisabledReason,
  onUsePromptAction,
  onAddPromptAction,
  onUpdatePromptAction,
  onDeletePromptAction,
}: ProjectScriptsControlProps) {
  const isPanel = displayMode === "panel";
  const ActionGroup = isPanel ? "div" : Group;
  const panelAnchorRef = React.useRef<HTMLDivElement | null>(null);
  const keybindings =
    useAtomValue(serverEnvironment.configValueAtom(environmentId))?.keybindings ??
    DEFAULT_RESOLVED_KEYBINDINGS;
  const addScriptFormId = React.useId();
  const [editingScriptId, setEditingScriptId] = useState<string | null>(null);
  const [editingPromptActionId, setEditingPromptActionId] = useState<string | null>(null);
  const [actionType, setActionType] = useState<"command" | "prompt">("command");
  const [actionScope, setActionScope] = useState<ProjectActionScope>("project");
  /** Scope the action being edited was loaded from, so a save can move it. */
  const [editingScope, setEditingScope] = useState<ProjectActionScope>("project");
  const [actionsMenuOpen, setActionsMenuOpen] = useState({
    presentation,
    scripts: false,
    imports: false,
  });
  if (actionsMenuOpen.presentation !== presentation) {
    setActionsMenuOpen({ presentation, scripts: false, imports: false });
  }
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [command, setCommand] = useState("");
  const [prompt, setPrompt] = useState("");
  const [modelSelection, setModelSelection] = useState<ModelSelection | null>(null);
  const [icon, setIcon] = useState<ProjectScriptIcon>("play");
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [runOnWorktreeCreate, setRunOnWorktreeCreate] = useState(false);
  const [runOnSettle, setRunOnSettle] = useState(false);
  const [keybinding, setKeybinding] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [autoOpenPreview, setAutoOpenPreview] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const providerInstanceEntries = useMemo(
    () =>
      settings
        ? sortProviderInstanceEntries(
            // Global actions run in any project, so the editor offers the
            // server-wide provider list; ChatView re-checks the project on use.
            applyProviderInstanceSettings(
              deriveProviderInstanceEntries(providerStatuses),
              settings,
              null,
            ),
          )
        : [],
    [providerStatuses, settings],
  );
  const modelOptionsByInstance = useMemo(() => {
    const result = new Map<
      ModelSelection["instanceId"],
      ReturnType<typeof getAppModelOptionsForInstance>
    >();
    if (!settings) return result;
    for (const entry of providerInstanceEntries) {
      result.set(entry.instanceId, getAppModelOptionsForInstance(settings, entry));
    }
    return result;
  }, [providerInstanceEntries, settings]);
  const selectedPromptProvider = modelSelection
    ? (providerInstanceEntries.find((entry) => entry.instanceId === modelSelection.instanceId) ??
      null)
    : null;

  // Project entries first, so every first-match lookup below resolves to the
  // project's own action when both scopes define one.
  const allScripts = useMemo(
    () => mergedActions({ project: scripts, global: globalScripts }),
    [globalScripts, scripts],
  );
  const allPromptActions = useMemo(
    () => mergedActions({ project: promptActions, global: globalPromptActions }),
    [globalPromptActions, promptActions],
  );
  /** Every id in use across both scopes and both action types. */
  const takenActionIds = useMemo(
    () => [
      ...allScripts.map((script) => script.id),
      ...allPromptActions.map((action) => action.id),
    ],
    [allPromptActions, allScripts],
  );

  const primaryScript = useMemo(() => {
    if (preferredScriptId) {
      const preferred = allScripts.find((script) => script.id === preferredScriptId);
      if (preferred) return preferred;
    }
    return primaryProjectScript(allScripts);
  }, [allScripts, preferredScriptId]);
  const importableScripts = useMemo(
    () => importableFileScripts(fileScripts, scripts),
    [fileScripts, scripts],
  );
  const isEditing = editingScriptId !== null || editingPromptActionId !== null;

  const captureKeybinding = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Tab") return;
    event.preventDefault();
    if (event.key === "Backspace" || event.key === "Delete") {
      setKeybinding("");
      return;
    }
    const next = keybindingFromKeyboardEvent(event, navigator.platform);
    if (!next) return;
    setKeybinding(next);
  };

  const submitAction = async (event: FormEvent) => {
    event.preventDefault();
    const trimmedName = name.trim();
    if (trimmedName.length === 0) {
      setValidationError("Name is required.");
      return;
    }
    if (actionType === "prompt") {
      const trimmedPrompt = prompt.trim();
      if (trimmedPrompt.length === 0) {
        setValidationError("Prompt is required.");
        return;
      }
      if (!modelSelection) {
        setValidationError("Choose a model for this prompt.");
        return;
      }
      const payload: NewProjectPromptActionInput = {
        name: trimmedName,
        prompt: trimmedPrompt,
        icon,
        modelSelection,
      };
      const result = editingPromptActionId
        ? await onUpdatePromptAction?.(editingPromptActionId, payload, {
            from: editingScope,
            to: actionScope,
          })
        : await onAddPromptAction?.(payload, actionScope);
      if (!result) {
        setValidationError("Prompt actions are not supported by this server.");
        return;
      }
      if (result._tag === "Failure") {
        if (!isAtomCommandInterrupted(result)) {
          const error = squashAtomCommandFailure(result);
          setValidationError(error instanceof Error ? error.message : "Failed to save action.");
        }
        return;
      }
      setDialogOpen(false);
      setIconPickerOpen(false);
      return;
    }

    const trimmedCommand = command.trim();
    if (trimmedCommand.length === 0) {
      setValidationError("Command is required.");
      return;
    }

    setValidationError(null);
    let payload: NewProjectScriptInput;
    try {
      const scriptIdForValidation =
        editingScriptId ?? nextProjectScriptId(trimmedName, takenActionIds);
      const keybindingRule = decodeProjectScriptKeybindingRule({
        keybinding,
        command: commandForProjectScript(scriptIdForValidation),
      });
      const trimmedPreviewUrl = previewUrl.trim();
      payload = {
        name: trimmedName,
        command: trimmedCommand,
        icon,
        runOnWorktreeCreate,
        waitForSetup: runOnWorktreeCreate,
        runOnSettle,
        // Keybindings live in settings, so only a settings writer sends one.
        ...(readEnvironmentScope(environmentId, AuthSettingsWriteScope)
          ? { keybinding: keybindingRule?.key ?? null }
          : {}),
        previewUrl: trimmedPreviewUrl.length > 0 ? trimmedPreviewUrl : null,
        autoOpenPreview: trimmedPreviewUrl.length > 0 ? autoOpenPreview : false,
      } satisfies NewProjectScriptInput;
    } catch (error) {
      setValidationError(error instanceof Error ? error.message : "Failed to save action.");
      return;
    }

    const result = editingScriptId
      ? await onUpdateScript(editingScriptId, payload, { from: editingScope, to: actionScope })
      : await onAddScript(payload, actionScope);
    if (result._tag === "Failure") {
      if (!isAtomCommandInterrupted(result)) {
        const error = squashAtomCommandFailure(result);
        setValidationError(error instanceof Error ? error.message : "Failed to save action.");
      }
      return;
    }
    setDialogOpen(false);
    setIconPickerOpen(false);
  };

  const openAddDialog = () => {
    setEditingScriptId(null);
    setEditingPromptActionId(null);
    setActionType("command");
    setActionScope("project");
    setEditingScope("project");
    setName("");
    setCommand("");
    setPrompt("");
    setModelSelection(getCurrentModelSelection?.() ?? null);
    setIcon("play");
    setIconPickerOpen(false);
    setRunOnWorktreeCreate(false);
    setRunOnSettle(false);
    setKeybinding("");
    setPreviewUrl("");
    setAutoOpenPreview(false);
    setValidationError(null);
    setDialogOpen(true);
  };

  const openEditDialog = (script: ProjectScript, scope: ProjectActionScope) => {
    onRequestMenuClose?.();
    setActionsMenuOpen({ presentation, scripts: false, imports: false });
    setEditingScriptId(script.id);
    setEditingPromptActionId(null);
    setActionType("command");
    setActionScope(scope);
    setEditingScope(scope);
    setName(script.name);
    setCommand(script.command);
    setIcon(script.icon);
    setIconPickerOpen(false);
    setRunOnWorktreeCreate(script.runOnWorktreeCreate);
    setRunOnSettle(script.runOnSettle ?? false);
    setKeybinding(keybindingValueForCommand(keybindings, commandForProjectScript(script.id)) ?? "");
    setPreviewUrl(script.previewUrl ?? "");
    setAutoOpenPreview(script.autoOpenPreview ?? false);
    setValidationError(null);
    setDialogOpen(true);
  };

  const openEditPromptDialog = (action: ProjectPromptAction, scope: ProjectActionScope) => {
    setActionsMenuOpen({ presentation, scripts: false, imports: false });
    setEditingScriptId(null);
    setEditingPromptActionId(action.id);
    setActionType("prompt");
    setActionScope(scope);
    setEditingScope(scope);
    setName(action.name);
    setPrompt(action.prompt);
    setModelSelection(action.modelSelection);
    setCommand("");
    setIcon(action.icon);
    setIconPickerOpen(false);
    setValidationError(null);
    setDialogOpen(true);
  };

  const confirmDeleteAction = useCallback(() => {
    if (!editingScriptId && !editingPromptActionId) return;
    setDeleteConfirmOpen(false);
    setDialogOpen(false);
    // Delete from where the action actually lives, not from whatever scope the
    // selector happens to be showing.
    if (editingScriptId) {
      void onDeleteScript(editingScriptId, editingScope);
      return;
    }
    if (editingPromptActionId) {
      void onDeletePromptAction?.(editingPromptActionId, editingScope);
    }
  }, [editingPromptActionId, editingScope, editingScriptId, onDeletePromptAction, onDeleteScript]);

  const importFileScript = async (fileScript: T3ProjectFileScript) => {
    const payload: NewProjectScriptInput = {
      name: fileScript.name,
      command: fileScript.command,
      icon: fileScript.icon ?? "play",
      runOnWorktreeCreate: fileScript.runOnWorktreeCreate ?? false,
      waitForSetup: fileScript.runOnWorktreeCreate === true && fileScript.async === false,
      runOnSettle: fileScript.runOnSettle ?? false,
      ...(readEnvironmentScope(environmentId, AuthSettingsWriteScope) ? { keybinding: null } : {}),
      previewUrl: fileScript.previewUrl ?? null,
      autoOpenPreview: fileScript.previewUrl ? (fileScript.autoOpenPreview ?? false) : false,
    };
    // A t3.json script is declared by the repo, so importing it can only ever
    // land on the project.
    const result = await onAddScript(payload, "project");
    if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
      const error = squashAtomCommandFailure(result);
      setEditingScriptId(null);
      setActionScope("project");
      setEditingScope("project");
      setName(payload.name);
      setCommand(payload.command);
      setIcon(payload.icon);
      setIconPickerOpen(false);
      setRunOnWorktreeCreate(payload.runOnWorktreeCreate);
      setRunOnSettle(payload.runOnSettle);
      setKeybinding("");
      setPreviewUrl(payload.previewUrl ?? "");
      setAutoOpenPreview(payload.autoOpenPreview);
      setValidationError(error instanceof Error ? error.message : "Failed to import action.");
      setDialogOpen(true);
    }
  };

  const importMenuItems = importableScripts.length > 0 && (
    <>
      {(allScripts.length > 0 || allPromptActions.length > 0) && <MenuSeparator />}
      <MenuGroup>
        <MenuGroupLabel>From t3.json</MenuGroupLabel>
        {importableScripts.map((fileScript) => (
          <MenuItem
            density={presentation === "menu" ? "touch" : "default"}
            key={`${fileScript.name} ${fileScript.command}`}
            onClick={() => void importFileScript(fileScript)}
          >
            <ScriptIcon icon={fileScript.icon ?? "play"} className="size-4" />
            <MenuItemLabel>{fileScript.name}</MenuItemLabel>
            <MenuShortcut>
              <DownloadIcon className="size-3.5" aria-label="Import" />
            </MenuShortcut>
          </MenuItem>
        ))}
      </MenuGroup>
    </>
  );

  const renderPromptEntry = (action: ProjectPromptAction, scope: ProjectActionScope) => {
    const currentReason = getPromptActionDisabledReason?.(action, "current") ?? null;
    const newReason = getPromptActionDisabledReason?.(action, "new") ?? null;
    return (
      <MenuSub key={`${scope}:${action.id}`}>
        <MenuSubTrigger>
          <ScriptIcon icon={action.icon} className="size-4" />
          <span className="truncate">{action.name}</span>
        </MenuSubTrigger>
        <MenuSubPopup>
          <MenuItem
            disabled={currentReason !== null}
            title={currentReason ?? undefined}
            onClick={() => onUsePromptAction?.(action, "current")}
          >
            <MessageSquareTextIcon className="size-4" />
            <span className="min-w-0">
              <span className="block">Use in current chat</span>
              {currentReason ? (
                <span className="block max-w-64 truncate text-xs text-muted-foreground">
                  {currentReason}
                </span>
              ) : null}
            </span>
          </MenuItem>
          <MenuItem
            disabled={newReason !== null}
            title={newReason ?? undefined}
            onClick={() => onUsePromptAction?.(action, "new")}
          >
            <PlusIcon className="size-4" />
            <span className="min-w-0">
              <span className="block">Open in new chat</span>
              {newReason ? (
                <span className="block max-w-64 truncate text-xs text-muted-foreground">
                  {newReason}
                </span>
              ) : null}
            </span>
          </MenuItem>
          <MenuSeparator />
          <MenuItem onClick={() => openEditPromptDialog(action, scope)}>
            <SettingsIcon className="size-4" />
            Edit prompt
          </MenuItem>
        </MenuSubPopup>
      </MenuSub>
    );
  };

  const renderScriptEntry = (script: ProjectScript, scope: ProjectActionScope) => {
    const shortcutLabel = shortcutLabelForCommand(keybindings, commandForProjectScript(script.id));
    return (
      <MenuItem
        density={presentation === "menu" ? "touch" : "default"}
        key={`${scope}:${script.id}`}
        className="group"
        disabled={!onRunScript}
        onClick={() => onRunScript?.(script)}
      >
        <ScriptIcon icon={script.icon} className="size-4" />
        <MenuItemLabel>{projectScriptMenuLabel(script)}</MenuItemLabel>
        <span className="relative ms-auto flex h-6 min-w-6 items-center justify-end">
          {shortcutLabel &&
            (presentation === "menu" ? (
              <MenuShortcut className="ms-0 mr-7">{shortcutLabel}</MenuShortcut>
            ) : (
              // The shortcut yields its slot to the edit button on hover.
              <span className="transition-opacity group-hover:opacity-0 group-focus-visible:opacity-0">
                <MenuShortcut className="ms-0">{shortcutLabel}</MenuShortcut>
              </span>
            ))}
          <span
            className={`absolute right-0 top-1/2 flex -translate-y-1/2 ${presentation === "menu" ? "" : "opacity-0 pointer-events-none transition-opacity group-hover:opacity-100 group-hover:pointer-events-auto group-focus-visible:opacity-100 group-focus-visible:pointer-events-auto"}`}
          >
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="size-6"
              aria-label={`Edit ${script.name}`}
              onPointerDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                openEditDialog(script, scope);
              }}
            >
              <SettingsIcon className="size-3.5" />
            </Button>
          </span>
        </span>
      </MenuItem>
    );
  };

  const promptMenuItems = allPromptActions.length > 0 && (
    <>
      {promptActions.length > 0 ? (
        <>
          {allScripts.length > 0 ? <MenuSeparator /> : null}
          <MenuGroup>
            <MenuGroupLabel>Prompts</MenuGroupLabel>
            {promptActions.map((action) => renderPromptEntry(action, "project"))}
          </MenuGroup>
        </>
      ) : null}
      {globalPromptActions.length > 0 ? (
        <>
          {allScripts.length > 0 || promptActions.length > 0 ? <MenuSeparator /> : null}
          <MenuGroup>
            <MenuGroupLabel>Global prompts</MenuGroupLabel>
            {globalPromptActions.map((action) => renderPromptEntry(action, "global"))}
          </MenuGroup>
        </>
      ) : null}
    </>
  );

  const scriptItems = (
    <>
      {scripts.map((script) => renderScriptEntry(script, "project"))}
      {globalScripts.length > 0 ? (
        <>
          {scripts.length > 0 ? <MenuSeparator /> : null}
          <MenuGroup>
            <MenuGroupLabel>Global</MenuGroupLabel>
            {globalScripts.map((script) => renderScriptEntry(script, "global"))}
          </MenuGroup>
        </>
      ) : null}
      {promptMenuItems}
      {importMenuItems}
      <MenuItem density={presentation === "menu" ? "touch" : "default"} onClick={openAddDialog}>
        <PlusIcon className="size-4" />
        <MenuItemLabel>{isPanel ? "Add project script" : "Add action"}</MenuItemLabel>
      </MenuItem>
    </>
  );

  return (
    <>
      {presentation === "menu" ? (
        <>
          {primaryScript && (
            <MenuItem
              density={presentation === "menu" ? "touch" : "default"}
              disabled={!onRunScript}
              onClick={() => onRunScript?.(primaryScript)}
            >
              <ScriptIcon icon={primaryScript.icon} className="size-4" />
              <MenuItemLabel>Run {primaryScript.name}</MenuItemLabel>
              <MenuShortcut>
                {shortcutLabelForCommand(keybindings, commandForProjectScript(primaryScript.id))}
              </MenuShortcut>
            </MenuItem>
          )}
          {allScripts.length > 0 || importableScripts.length > 0 ? (
            <MenuSub
              open={actionsMenuOpen.scripts}
              onOpenChange={(open) =>
                setActionsMenuOpen({ presentation, scripts: open, imports: false })
              }
            >
              <MenuSubTrigger density="touch">
                <ScriptIcon icon="play" className="size-4" />
                <MenuItemLabel>Project actions</MenuItemLabel>
              </MenuSubTrigger>
              <MenuSubPopup>{scriptItems}</MenuSubPopup>
            </MenuSub>
          ) : (
            <MenuItem
              density={presentation === "menu" ? "touch" : "default"}
              onClick={openAddDialog}
            >
              <PlusIcon className="size-4" />
              <MenuItemLabel>Add project action…</MenuItemLabel>
            </MenuItem>
          )}
        </>
      ) : primaryScript ? (
        <ActionGroup
          role="group"
          aria-label="Project scripts"
          {...(isPanel
            ? { className: THREAD_DETAILS_PANEL_SPLIT_GROUP_CLASS, ref: panelAnchorRef }
            : {})}
        >
          <Tooltip>
            <TooltipTrigger
              render={
                <ThreadDetailsControl
                  size="xs"
                  variant={isPanel ? "ghost" : "outline"}
                  part="primary"
                  panel={isPanel}
                  className={isPanel ? undefined : "w-7 sm:w-6 @3xl/header-actions:w-auto!"}
                  aria-label={`Run ${primaryScript.name}`}
                  // The tooltip wrapper replaces data-slot="button", so themed
                  // toolbar styling needs its own hook.
                  data-toolbar-control=""
                  aria-disabled={!onRunScript || undefined}
                  onClick={() => onRunScript?.(primaryScript)}
                />
              }
            >
              <ScriptIcon
                icon={primaryScript.icon}
                {...(isPanel ? { className: THREAD_DETAILS_PANEL_ICON_CLASS } : {})}
              />
              <span
                className={cn(
                  "sr-only @3xl/header-actions:not-sr-only @3xl/header-actions:ml-0.5",
                  isPanel && cn("not-sr-only ml-0 truncate", THREAD_DETAILS_PANEL_LABEL_CLASS),
                )}
              >
                {primaryScript.name}
              </span>
            </TooltipTrigger>
            <TooltipPopup side="top">
              {onRunScript
                ? `Run ${primaryScript.name}`
                : "Pair this client again with permission to run terminal commands."}
            </TooltipPopup>
          </Tooltip>
          {isPanel ? (
            <span aria-hidden="true" className={THREAD_DETAILS_PANEL_SPLIT_SEPARATOR_CLASS} />
          ) : (
            <GroupSeparator className="hidden @3xl/header-actions:block" />
          )}
          <Menu
            open={actionsMenuOpen.scripts}
            onOpenChange={(open) =>
              setActionsMenuOpen({ presentation, scripts: open, imports: false })
            }
          >
            <MenuTrigger
              render={
                <ThreadDetailsControl
                  size={isPanel ? "sm" : "icon-xs"}
                  variant={isPanel ? "ghost" : "outline"}
                  part="secondary"
                  panel={isPanel}
                  aria-label="Script actions"
                />
              }
            >
              <ChevronDownIcon
                className={isPanel ? THREAD_DETAILS_PANEL_CHEVRON_CLASS : "size-4"}
              />
            </MenuTrigger>
            <MenuPopup
              align="end"
              {...(isPanel ? { anchor: panelAnchorRef } : {})}
              className={isPanel ? "w-(--anchor-width)" : undefined}
            >
              {scriptItems}
            </MenuPopup>
          </Menu>
        </ActionGroup>
      ) : allScripts.length > 0 || allPromptActions.length > 0 || importableScripts.length > 0 ? (
        // No one-click action (only a settle action, prompts, or t3.json
        // imports), so the saved actions stay reachable through this menu.
        isPanel ? (
          <div
            role="group"
            aria-label="Project actions"
            className={THREAD_DETAILS_PANEL_SPLIT_GROUP_CLASS}
            ref={panelAnchorRef}
          >
            <ThreadDetailsControl
              size="sm"
              variant="ghost"
              part="primary"
              aria-label="Project actions"
              onClick={() => setActionsMenuOpen({ presentation, scripts: false, imports: true })}
            >
              {allPromptActions.length > 0 ? (
                <MessageSquareTextIcon className={THREAD_DETAILS_PANEL_ICON_CLASS} />
              ) : (
                <WrenchIcon className={THREAD_DETAILS_PANEL_ICON_CLASS} />
              )}
              <span className={cn("min-w-0 truncate", THREAD_DETAILS_PANEL_LABEL_CLASS)}>
                Actions
              </span>
            </ThreadDetailsControl>
            <span aria-hidden="true" className={THREAD_DETAILS_PANEL_SPLIT_SEPARATOR_CLASS} />
            <Menu
              highlightItemOnHover={false}
              open={actionsMenuOpen.imports}
              onOpenChange={(open) =>
                setActionsMenuOpen({ presentation, scripts: false, imports: open })
              }
            >
              <MenuTrigger
                render={
                  <ThreadDetailsControl
                    size="sm"
                    variant="ghost"
                    part="secondary"
                    aria-label="Choose project action"
                  />
                }
              >
                <ChevronDownIcon className={THREAD_DETAILS_PANEL_CHEVRON_CLASS} />
              </MenuTrigger>
              <MenuPopup align="end" anchor={panelAnchorRef} className="w-(--anchor-width)">
                {scriptItems}
              </MenuPopup>
            </Menu>
          </div>
        ) : (
          <Menu
            open={actionsMenuOpen.imports}
            onOpenChange={(open) =>
              setActionsMenuOpen({ presentation, scripts: false, imports: open })
            }
          >
            <MenuTrigger
              render={<Button size="xs" variant="outline" aria-label="Project actions" />}
            >
              {allPromptActions.length > 0 ? (
                <MessageSquareTextIcon className="size-3.5" />
              ) : (
                <PlusIcon className="size-3.5" />
              )}
              <span className="sr-only @3xl/header-actions:not-sr-only @3xl/header-actions:ml-0.5">
                Actions
              </span>
              <ChevronDownIcon className="size-3.5" />
            </MenuTrigger>
            <MenuPopup align="end">{scriptItems}</MenuPopup>
          </Menu>
        )
      ) : (
        <Tooltip>
          <TooltipTrigger
            render={
              <ThreadDetailsControl
                size="xs"
                variant={isPanel ? "ghost" : "outline"}
                part="row"
                panel={isPanel}
                className={isPanel ? undefined : "w-7 sm:w-6 @3xl/header-actions:w-auto!"}
                aria-label={isPanel ? "Add project script" : "Add action"}
                data-toolbar-control=""
                onClick={openAddDialog}
              />
            }
          >
            <PlusIcon className="size-3.5" />
            <span
              className={cn(
                "sr-only @3xl/header-actions:not-sr-only @3xl/header-actions:ml-0.5",
                isPanel && cn("not-sr-only ml-0.5", THREAD_DETAILS_PANEL_LABEL_CLASS),
              )}
            >
              {isPanel ? "Add project script" : "Add action"}
            </span>
          </TooltipTrigger>
          <TooltipPopup side="top">{isPanel ? "Add project script" : "Add action"}</TooltipPopup>
        </Tooltip>
      )}

      <Dialog
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setIconPickerOpen(false);
          }
        }}
        onOpenChangeComplete={(open) => {
          if (open) return;
          setEditingScriptId(null);
          setEditingPromptActionId(null);
          setActionType("command");
          setActionScope("project");
          setEditingScope("project");
          setName("");
          setCommand("");
          setPrompt("");
          setModelSelection(null);
          setIcon("play");
          setRunOnWorktreeCreate(false);
          setRunOnSettle(false);
          setKeybinding("");
          setPreviewUrl("");
          setAutoOpenPreview(false);
          setValidationError(null);
        }}
        open={dialogOpen}
      >
        <DialogPopup>
          <DialogHeader>
            <DialogTitle>{isEditing ? "Edit Action" : "Add Action"}</DialogTitle>
            <DialogDescription>
              {actionType === "command"
                ? "Commands run in a project terminal from the top bar or a keybinding."
                : "Prompts fill a composer with saved text, model, and traits without sending it."}
            </DialogDescription>
          </DialogHeader>
          <DialogPanel>
            <form id={addScriptFormId} className="space-y-4" onSubmit={submitAction}>
              {!isEditing && promptActionsSupported ? (
                <div
                  className="grid grid-cols-2 gap-1 rounded-md bg-muted p-1"
                  aria-label="Action type"
                >
                  <Button
                    type="button"
                    variant={actionType === "command" ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => setActionType("command")}
                  >
                    Command
                  </Button>
                  <Button
                    type="button"
                    variant={actionType === "prompt" ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => {
                      setActionType("prompt");
                      setModelSelection(
                        (current) => current ?? getCurrentModelSelection?.() ?? null,
                      );
                    }}
                  >
                    Prompt
                  </Button>
                </div>
              ) : null}
              {globalActionsSupported ? (
                <div className="space-y-1.5">
                  {/* Two buttons standing in for a radio group, so the label,
                      the hint, and which scope is chosen all reach assistive
                      tech. `htmlFor` cannot do that job here — the control is
                      a container, not a form element. */}
                  <Label id="action-scope-label" render={<span />}>
                    Scope
                  </Label>
                  <div
                    role="radiogroup"
                    aria-labelledby="action-scope-label"
                    aria-describedby="action-scope-hint"
                    className="grid grid-cols-2 gap-1 rounded-md bg-muted p-1"
                  >
                    <Button
                      type="button"
                      role="radio"
                      aria-checked={actionScope === "project"}
                      variant={actionScope === "project" ? "secondary" : "ghost"}
                      size="sm"
                      onClick={() => setActionScope("project")}
                    >
                      This project
                    </Button>
                    <Button
                      type="button"
                      role="radio"
                      aria-checked={actionScope === "global"}
                      variant={actionScope === "global" ? "secondary" : "ghost"}
                      size="sm"
                      onClick={() => setActionScope("global")}
                    >
                      Global
                    </Button>
                  </div>
                  <p id="action-scope-hint" className="text-xs text-muted-foreground">
                    {actionScope === "global"
                      ? "Available in every project on this server."
                      : "Available only in this project."}
                  </p>
                </div>
              ) : null}
              <div className="space-y-1.5">
                <Label htmlFor="action-name">Name</Label>
                <div className="flex items-center gap-2">
                  <Popover onOpenChange={setIconPickerOpen} open={iconPickerOpen}>
                    <PopoverTrigger
                      render={
                        <Button
                          type="button"
                          variant="outline"
                          className="size-9 shrink-0 hover:bg-popover active:bg-popover data-pressed:bg-popover data-pressed:shadow-xs/5 data-pressed:before:shadow-[0_1px_--theme(--color-black/4%)] dark:border-transparent dark:bg-white/[0.035] dark:data-pressed:before:shadow-none"
                          aria-label="Choose icon"
                        />
                      }
                    >
                      <ScriptIcon icon={icon} className="size-4.5" />
                    </PopoverTrigger>
                    <PopoverPopup align="start">
                      <div className="grid grid-cols-3 gap-2">
                        {SCRIPT_ICONS.map((entry) => {
                          const isSelected = entry.id === icon;
                          return (
                            <button
                              key={entry.id}
                              type="button"
                              className={`relative flex flex-col items-center gap-2 rounded-md border px-2 py-2 text-xs dark:border-transparent ${
                                isSelected
                                  ? "border-primary/70 bg-primary/10 dark:ring-1 dark:ring-primary/30"
                                  : "border-border/70 hover:bg-accent/60 dark:bg-white/[0.035]"
                              }`}
                              onClick={() => {
                                setIcon(entry.id);
                                setIconPickerOpen(false);
                              }}
                            >
                              <ScriptIcon icon={entry.id} className="size-4" />
                              <span>{entry.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </PopoverPopup>
                  </Popover>
                  <Input
                    id="action-name"
                    autoFocus
                    placeholder={actionType === "command" ? "Test" : "Review changes"}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />
                </div>
              </div>
              {actionType === "command" ? (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="script-keybinding">Keybinding</Label>
                    <Input
                      id="script-keybinding"
                      placeholder="Press shortcut"
                      value={keybinding}
                      readOnly
                      onKeyDown={captureKeybinding}
                    />
                    <p className="text-xs text-muted-foreground">
                      Press a shortcut. Use <code>Backspace</code> to clear.
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="script-command">Command</Label>
                    <Textarea
                      id="script-command"
                      placeholder="bun test"
                      value={command}
                      onChange={(event) => setCommand(event.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="script-preview-url">Preview URL (optional)</Label>
                    <Input
                      id="script-preview-url"
                      placeholder="http://localhost:5173"
                      value={previewUrl}
                      onChange={(event) => setPreviewUrl(event.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Open this URL in the in-app preview when this action runs.
                    </p>
                  </div>
                  <label className="flex items-center justify-between gap-3 rounded-md border border-border/70 px-3 py-2 text-sm dark:border-transparent dark:bg-white/[0.035]">
                    <span className="min-w-0">
                      <span className="block">Run automatically on worktree creation</span>
                      {actionScope === "global" ? (
                        <span className="block text-xs text-muted-foreground">
                          Skipped in projects that define their own setup action.
                        </span>
                      ) : null}
                    </span>
                    <Switch
                      checked={runOnWorktreeCreate}
                      onCheckedChange={(checked) => setRunOnWorktreeCreate(Boolean(checked))}
                    />
                  </label>
                  <label className="flex items-center justify-between gap-3 rounded-md border border-border/70 px-3 py-2 text-sm dark:border-transparent dark:bg-white/[0.035]">
                    <span>Run in the thread's worktree when the thread settles</span>
                    <Switch
                      checked={runOnSettle}
                      onCheckedChange={(checked) => setRunOnSettle(Boolean(checked))}
                    />
                  </label>
                  <label
                    className={`flex items-center justify-between gap-3 rounded-md border border-border/70 px-3 py-2 text-sm dark:border-transparent dark:bg-white/[0.035] ${
                      previewUrl.trim().length === 0 ? "opacity-60" : ""
                    }`}
                  >
                    <span>Open preview automatically when this action runs</span>
                    <Switch
                      checked={autoOpenPreview}
                      disabled={previewUrl.trim().length === 0}
                      onCheckedChange={(checked) => setAutoOpenPreview(Boolean(checked))}
                    />
                  </label>
                </>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="action-prompt">Prompt</Label>
                    <Textarea
                      id="action-prompt"
                      className="min-h-28"
                      placeholder="Review the current changes and identify correctness risks."
                      value={prompt}
                      onChange={(event) => setPrompt(event.target.value)}
                    />
                  </div>
                  {modelSelection ? (
                    <div className="space-y-1.5">
                      <Label>Model and traits</Label>
                      <div className="flex flex-wrap items-center gap-2 rounded-md border border-border/70 p-2 dark:border-transparent dark:bg-white/[0.035]">
                        <ProviderModelPicker
                          environmentId={environmentId}
                          activeInstanceId={modelSelection.instanceId}
                          model={modelSelection.model}
                          lockedProvider={null}
                          instanceEntries={providerInstanceEntries}
                          modelOptionsByInstance={modelOptionsByInstance}
                          triggerAriaLabel="Prompt action model"
                          onInstanceModelChange={(instanceId, model) =>
                            setModelSelection(createModelSelection(instanceId, model))
                          }
                        />
                        {selectedPromptProvider ? (
                          <TraitsPicker
                            provider={selectedPromptProvider.driverKind}
                            instanceId={selectedPromptProvider.instanceId}
                            models={selectedPromptProvider.models}
                            model={modelSelection.model}
                            modelOptions={modelSelection.options}
                            prompt={prompt}
                            onPromptChange={setPrompt}
                            planModeEnabled={settings?.planModeEnabled ?? false}
                            onModelOptionsChange={(options) =>
                              setModelSelection(
                                createModelSelection(
                                  modelSelection.instanceId,
                                  modelSelection.model,
                                  options,
                                ),
                              )
                            }
                          />
                        ) : null}
                      </div>
                      {!selectedPromptProvider ? (
                        <p className="text-sm text-destructive">
                          The saved provider is unavailable. Choose a replacement model.
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <p className="text-sm text-destructive">
                      No available model is selected. Open a chat with a configured provider first.
                    </p>
                  )}
                </>
              )}
              {validationError && <p className="text-sm text-destructive">{validationError}</p>}
            </form>
          </DialogPanel>
          <DialogFooter className="dark:border-transparent dark:bg-transparent">
            {isEditing && (
              <Button
                type="button"
                variant="destructive-outline"
                className="mr-auto"
                onClick={() => setDeleteConfirmOpen(true)}
              >
                Delete
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setDialogOpen(false);
              }}
            >
              Cancel
            </Button>
            <Button form={addScriptFormId} type="submit">
              {isEditing ? "Save changes" : "Save action"}
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete action "{name}"?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline" />}>Cancel</AlertDialogClose>
            <Button variant="destructive" onClick={confirmDeleteAction}>
              Delete action
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </>
  );
}
