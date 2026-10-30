import {
  ArchiveIcon,
  ArrowUpDownIcon,
  ChevronRightIcon,
  ChevronsDownUpIcon,
  ChevronsUpDownIcon,
  CloudIcon,
  ContainerIcon,
  EyeIcon,
  EyeOffIcon,
  FolderPlusIcon,
  Globe2Icon,
  LoaderIcon,
  PlusIcon,
  SearchIcon,
  TerminalIcon,
  TriangleAlertIcon,
} from "lucide-react";
import {
  ChangeRequestStatusIcon,
  prStatusIndicator,
  PrStatusTooltipContent,
  useLinkedThreadPullRequest,
  terminalStatusFromRunningIds,
  ThreadStatusLabel,
  ThreadWorktreeIndicator,
} from "./ThreadStatusIndicators";
import { ProjectFavicon } from "./ProjectFavicon";
import { useAtomValue } from "@effect/atom-react";
import { autoAnimate } from "@formkit/auto-animate";
import React, { useCallback, useEffect, memo, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  DndContext,
  type DragCancelEvent,
  type CollisionDetection,
  PointerSensor,
  type DragStartEvent,
  closestCorners,
  pointerWithin,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { restrictToFirstScrollableAncestor, restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { CSS } from "@dnd-kit/utilities";
import {
  type ContextMenuItem,
  ProjectId,
  type ScopedThreadRef,
  type ResolvedKeybindingsConfig,
  type SidebarProjectGroupingMode,
  ThreadId,
} from "@t3tools/contracts";
import {
  parseScopedThreadKey,
  scopedProjectKey,
  scopedThreadKey,
  scopeProjectRef,
  scopeThreadRef,
} from "@t3tools/client-runtime/environment";
import { safeErrorLogAttributes } from "@t3tools/client-runtime/errors";
import {
  isAtomCommandInterrupted,
  settlePromise,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { useLocation, useNavigate, useParams, useRouter } from "@tanstack/react-router";
import {
  type SidebarProjectSortOrder,
  type SidebarThreadPreviewCount,
  type SidebarThreadSortOrder,
} from "@t3tools/contracts/settings";
import { isDesktopLocalConnectionTarget } from "../connection/desktopLocal";
import { useDesktopLocalBootstraps } from "../connection/useDesktopLocalBootstraps";
import { isElectron } from "../env";
import { useOpenPrLink } from "../lib/openPullRequestLink";
import { isTerminalFocused } from "../lib/terminalFocus";
import { cn, isMacPlatform, randomUUID } from "../lib/utils";
import {
  readThreadShell,
  useAllEnvironmentShellsBootstrapped,
  useProject,
  useProjects,
  useThreadShells,
  useThreadShellsForProjectRefs,
} from "../state/entities";
import { selectThreadTerminalUiState, useTerminalUiStateStore } from "../terminalUiStateStore";
import { useThreadRunningTerminalIds } from "../state/terminalSessions";
import { useThreadDiscoveredPorts } from "../portDiscoveryState";
import { openDiscoveredPort } from "./preview/openDiscoveredPort";
import { useAtomCommand } from "../state/use-atom-command";
import { previewEnvironment } from "../state/preview";
import {
  legacyProjectCwdPreferenceKey,
  resolveProjectExpanded,
  useUiStateStore,
} from "../uiStateStore";
import {
  resolveShortcutCommand,
  shortcutLabelForCommand,
  shouldShowThreadJumpHintsForModifiers,
  threadJumpCommandForIndex,
  threadJumpIndexFromCommand,
  threadTraversalDirectionFromCommand,
} from "../keybindings";
import { isModelPickerOpen } from "../modelPickerVisibility";
import { useShortcutModifierState } from "../shortcutModifierState";
import { readLocalApi } from "../localApi";
import { DraftId, useComposerDraftStore } from "../composerDraftStore";
import { useNewThreadHandler } from "../hooks/useHandleNewThread";
import { useOpenThreadTab } from "../hooks/useThreadTabs";
import { useDesktopUpdateState } from "../state/desktopUpdate";

import { useThreadActions } from "../hooks/useThreadActions";
import { threadRuntimeCanArchive } from "@t3tools/client-runtime/state/models";
import { projectEnvironment } from "../state/projects";
import { useEnvironmentQuery } from "../state/query";
import { threadEnvironment, useEnvironmentThread } from "../state/threads";
import { vcsEnvironment } from "../state/vcs";
import { useEnvironment, useEnvironments, usePrimaryEnvironmentId } from "../state/environments";
import {
  buildThreadRouteParams,
  resolveActiveThreadRouteRef,
  resolveThreadRouteTarget,
} from "../threadRoutes";
import { stackedThreadToast, toastManager } from "./ui/toast";
import { DiffStatLabel } from "./chat/DiffStatLabel";
import { planWorkspaceStatusRefresh, workspaceStatusRefreshCount } from "./sidebarWorkspaceRefresh";
import { SidebarWorkspaceStatusIcon } from "./SidebarWorkspaceStatusIcon";
import { GlidingHighlight } from "./beautiful/GlidingHighlight";
import { useDelegatedGlidingHighlight } from "./beautiful/useGlidingHighlight";
import { resolveSidebarWorkspaceDiffStat } from "./sidebarWorkspaceDiff";
import {
  resolveSidebarWorkspaceStatus,
  type ThreadAttentionStatus,
} from "./sidebarWorkspaceStatus";
import {
  hiddenRepositoriesLabel,
  partitionSidebarProjects,
  pruneHiddenProjectKeys,
  toggleHiddenProjectKey,
} from "./sidebarHiddenProjects";
import { SidebarProjectGroupFilter } from "./SidebarProjectGroupFilter";
import { useProjectGroupStatusById } from "./sidebarProjectGroupStatus";
import {
  createProjectGroup,
  filterProjectsByGroup,
  isValidProjectGroupName,
  resolveActiveProjectGroup,
  toggleProjectInGroup,
} from "./sidebarProjectGroups";
import { formatRelativeTimeLabel } from "../timestampFormat";
import { SettingsSidebarNav } from "./settings/SettingsSidebarNav";
import { Kbd } from "./ui/kbd";
import {
  getArm64IntelBuildWarningDescription,
  getDesktopUpdateActionError,
  getDesktopUpdateInstallConfirmationMessage,
  isDesktopUpdateButtonDisabled,
  resolveDesktopUpdateButtonAction,
  shouldShowArm64IntelBuildWarning,
  shouldToastDesktopUpdateActionResult,
} from "./desktopUpdate.logic";
import { showDesktopUpdateDownloadedToast } from "./desktopUpdate.toast";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "./ui/alert";
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
import { Input } from "./ui/input";
import { Menu, MenuGroup, MenuPopup, MenuRadioGroup, MenuRadioItem, MenuTrigger } from "./ui/menu";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "./ui/select";
import { Tooltip, TooltipPopup, TooltipTrigger } from "./ui/tooltip";
import {
  SidebarContent,
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "./ui/sidebar";
import { useThreadSelectionStore } from "../threadSelectionStore";
import { openCommandPalette } from "../commandPaletteBus";
import {
  archiveSelectedThreadEntries,
  resolveAdjacentThreadId,
  isTrailingDoubleClick,
  resolveProjectStatusIndicator,
  resolveThreadStatusPill,
  orderItemsByPreferredIds,
  sortProjectsForSidebar,
  useThreadJumpHintsVisible,
  ThreadStatusPill,
} from "./Sidebar.logic";
import {
  buildMultiSelectThreadContextMenuItems,
  getSidebarThreadIdsToPrewarm,
  isContextMenuPointerDown,
  shouldClearThreadSelectionOnMouseDown,
} from "./sidebarVoid.logic";
import { sortThreads } from "@t3tools/client-runtime/state/thread-sort";
import { SidebarChromeFooter, SidebarChromeHeader } from "./sidebar/SidebarChrome";
import { useCopyToClipboard } from "~/hooks/useCopyToClipboard";
import { LONG_PRESS_TARGET_STYLE, useLongPressContextMenu } from "~/hooks/useLongPressContextMenu";
import { useMediaQuery } from "~/hooks/useMediaQuery";
import { usePrivateProjectName } from "~/hooks/usePrivateProjectNames";
import { CommandDialogTrigger } from "./ui/command";
import { useClientSettings, useUpdateClientSettings } from "~/hooks/useSettings";
import { primaryServerKeybindingsAtom } from "../state/server";
import {
  derivePhysicalProjectKey,
  deriveProjectGroupingOverrideKey,
  getProjectOrderKey,
  selectProjectGroupingSettings,
} from "@t3tools/client-runtime/state/project-grouping";
import type { SidebarThreadSummary } from "../types";
import {
  buildPhysicalToLogicalProjectKeyMap,
  buildSidebarProjectSnapshots,
  type SidebarProjectGroupMember,
  type SidebarProjectSnapshot,
} from "../sidebarProjectGrouping";
import {
  buildProjectWorkspaces,
  selectWorkspaceEntrySession,
  workspaceFallbackLabel,
  type ProjectWorkspace,
} from "../workspaceSessions";
import { selectWorkspaceThreadTabs, useThreadTabsStore } from "../threadTabsStore";
import { buildWorkspaceContextMenuItems, useWorkspaceSidebarStore } from "../workspaceSidebarStore";
import {
  resolveWorkspaceTabListExpanded,
  useWorkspaceTabListStore,
} from "../workspaceTabListStore";
import { SidebarWorkspaceRowActions } from "./sidebar/SidebarWorkspaceRowActions";
import {
  SidebarRouteThreadKeyContext,
  SidebarWorkspaceTabList,
} from "./sidebar/SidebarWorkspaceTabs";
const SIDEBAR_SORT_LABELS: Record<SidebarProjectSortOrder, string> = {
  updated_at: "Last user message",
  created_at: "Created at",
  manual: "Manual",
};
const SIDEBAR_LIST_ANIMATION_OPTIONS = {
  duration: 180,
  easing: "ease-out",
} as const;
const EMPTY_THREAD_JUMP_LABELS = new Map<string, string>();
const PROJECT_GROUPING_MODE_LABELS: Record<SidebarProjectGroupingMode, string> = {
  repository: "Group by repository",
  repository_path: "Group by repository path",
  separate: "Keep separate",
};
// A workspace row reveals its actions on hover, keyboard focus, or while its
// history menu is open; on touch screens, where nothing hovers, the active row
// keeps them out. Revealed actions take the place of the diff stat, so a row at
// rest gives its label the full width. Every class is spelled out in full
// because Tailwind only generates classes it finds written in the source.
function workspaceRowRevealClass(input: {
  readonly isActive: boolean;
  readonly revealed: "flex" | "block" | "hidden";
}): string {
  switch (input.revealed) {
    case "flex":
      return cn(
        "hidden group-hover/workspace-row:flex group-has-focus-visible/workspace-row:flex group-has-data-popup-open/workspace-row:flex",
        input.isActive && "pointer-coarse:flex",
      );
    case "block":
      return cn(
        "hidden group-hover/workspace-row:block group-has-focus-visible/workspace-row:block group-has-data-popup-open/workspace-row:block",
        input.isActive && "pointer-coarse:block",
      );
    case "hidden":
      return cn(
        "group-hover/workspace-row:hidden group-has-focus-visible/workspace-row:hidden group-has-data-popup-open/workspace-row:hidden",
        input.isActive && "pointer-coarse:hidden",
      );
  }
}
const SIDEBAR_ICON_ACTION_BUTTON_CLASS =
  "inline-flex h-6 min-w-6 cursor-pointer items-center justify-center rounded-md px-[calc(--spacing(1)-1px)] text-muted-foreground/60 hover:text-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring";

/** Thread row look by selection state. Upstream dropped this with its legacy rows. */
function resolveThreadRowClassName(input: { isActive: boolean; isSelected: boolean }): string {
  const baseClassName =
    "h-8 w-full translate-x-0 cursor-pointer justify-start rounded-md px-2 text-left text-sm select-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring";

  if (input.isActive) {
    return cn(
      baseClassName,
      "bg-sidebar-row-active text-sidebar-foreground font-medium hover:bg-sidebar-row-active hover:text-sidebar-foreground",
    );
  }

  if (input.isSelected) {
    return cn(
      baseClassName,
      "bg-sidebar-row-selected text-sidebar-foreground hover:bg-sidebar-row-active hover:text-sidebar-foreground",
    );
  }

  return cn(
    baseClassName,
    "text-sidebar-muted-foreground/80 hover:bg-sidebar-row-hover hover:text-sidebar-foreground",
  );
}

function SidebarThreadDetailPrewarmer({ threadRef }: { readonly threadRef: ScopedThreadRef }) {
  useEnvironmentThread(threadRef.environmentId, threadRef.threadId);
  return null;
}

function formatProjectMemberActionLabel(
  member: SidebarProjectGroupMember,
  groupedProjectCount: number,
): string {
  if (groupedProjectCount <= 1) {
    return member.title;
  }

  return member.environmentLabel
    ? `${member.environmentLabel} — ${member.workspaceRoot}`
    : member.workspaceRoot;
}

function projectExpansionPreferenceKeys(project: SidebarProjectSnapshot): string[] {
  return [
    project.projectKey,
    ...project.memberProjects.map((member) => member.physicalProjectKey),
    ...project.memberProjects.map((member) => legacyProjectCwdPreferenceKey(member.workspaceRoot)),
  ];
}

function projectGroupingModeDescription(mode: SidebarProjectGroupingMode): string {
  switch (mode) {
    case "repository":
      return "Projects from the same repository share one sidebar row.";
    case "repository_path":
      return "Projects group only when both the repository and repo-relative path match.";
    case "separate":
      return "Every project path gets its own sidebar row.";
  }
}

function resolveWorkspaceStatusByKey(
  workspaces: readonly ProjectWorkspace[],
  workspaceThreadByKey: ReadonlyMap<string, SidebarThreadSummary>,
  lastVisitedAtByThreadKey: ReadonlyMap<string, string | null>,
) {
  return new Map(
    workspaces.map((workspace) => [
      workspace.key,
      resolveSidebarWorkspaceStatus(
        workspace.sessions.flatMap((session) => {
          const thread = workspaceThreadByKey.get(session.key);
          return thread
            ? [{ ...thread, lastVisitedAt: lastVisitedAtByThreadKey.get(session.key) ?? undefined }]
            : [];
        }),
      ),
    ]),
  );
}

function resolveWorkspaceRefreshCountByKey(
  workspaces: readonly ProjectWorkspace[],
  workspaceThreadByKey: ReadonlyMap<string, SidebarThreadSummary>,
  lastVisitedAtByThreadKey: ReadonlyMap<string, string | null>,
) {
  return new Map(
    workspaces.map((workspace) => [
      workspace.key,
      workspaceStatusRefreshCount(
        planWorkspaceStatusRefresh({
          sessions: workspace.sessions,
          threadByKey: workspaceThreadByKey,
          lastVisitedAtByThreadKey,
        }),
      ),
    ]),
  );
}

function useWorkspaceStatusByKey(
  workspaces: readonly ProjectWorkspace[],
  workspaceThreadByKey: ReadonlyMap<string, SidebarThreadSummary>,
) {
  const threadKeys = useMemo(
    () => workspaces.flatMap((workspace) => workspace.sessions.map((session) => session.key)),
    [workspaces],
  );
  const lastVisitedAts = useUiStateStore(
    useShallow((state) =>
      threadKeys.map((threadKey) => state.threadLastVisitedAtById[threadKey] ?? null),
    ),
  );
  const lastVisitedAtByThreadKey = useMemo(
    () => new Map(threadKeys.map((threadKey, index) => [threadKey, lastVisitedAts[index] ?? null])),
    [lastVisitedAts, threadKeys],
  );

  return useMemo(
    () => ({
      statusByKey: resolveWorkspaceStatusByKey(
        workspaces,
        workspaceThreadByKey,
        lastVisitedAtByThreadKey,
      ),
      refreshCountByKey: resolveWorkspaceRefreshCountByKey(
        workspaces,
        workspaceThreadByKey,
        lastVisitedAtByThreadKey,
      ),
    }),
    [lastVisitedAtByThreadKey, workspaces, workspaceThreadByKey],
  );
}

/**
 * Clears the stale status icons on one workspace row. The returned callback is
 * stable so the memoized rows do not re-render whenever any chat updates; it
 * reads the current threads through a ref instead.
 */
function useWorkspaceStatusRefresh(
  workspaceThreadByKey: ReadonlyMap<string, SidebarThreadSummary>,
) {
  const stopThreadSession = useAtomCommand(threadEnvironment.stopSession, "thread session stop");
  const threadByKeyRef = useRef(workspaceThreadByKey);
  threadByKeyRef.current = workspaceThreadByKey;

  return useCallback(
    (workspace: ProjectWorkspace) => {
      const uiState = useUiStateStore.getState();
      const plan = planWorkspaceStatusRefresh({
        sessions: workspace.sessions,
        threadByKey: threadByKeyRef.current,
        lastVisitedAtByThreadKey: new Map(
          workspace.sessions.map((session) => [
            session.key,
            uiState.threadLastVisitedAtById[session.key] ?? null,
          ]),
        ),
      });

      const visitedAt = new Date().toISOString();
      for (const target of plan.markVisited) {
        uiState.markThreadVisited(target.key, visitedAt);
      }
      for (const target of plan.stopSession) {
        void stopThreadSession({
          environmentId: target.environmentId,
          input: { threadId: target.threadId },
        });
      }
    },
    [stopThreadSession],
  );
}

function buildThreadJumpLabelMap(input: {
  keybindings: ResolvedKeybindingsConfig;
  platform: string;
  terminalOpen: boolean;
  threadJumpCommandByKey: ReadonlyMap<
    string,
    NonNullable<ReturnType<typeof threadJumpCommandForIndex>>
  >;
}): ReadonlyMap<string, string> {
  if (input.threadJumpCommandByKey.size === 0) {
    return EMPTY_THREAD_JUMP_LABELS;
  }

  const shortcutLabelOptions = {
    platform: input.platform,
    context: {
      terminalFocus: false,
      terminalOpen: input.terminalOpen,
    },
  } as const;
  const mapping = new Map<string, string>();
  for (const [threadKey, command] of input.threadJumpCommandByKey) {
    const label = shortcutLabelForCommand(input.keybindings, command, shortcutLabelOptions);
    if (label) {
      mapping.set(threadKey, label);
    }
  }
  return mapping.size > 0 ? mapping : EMPTY_THREAD_JUMP_LABELS;
}

interface SidebarThreadRowProps {
  thread: SidebarThreadSummary;
  projectCwd: string | null;
  orderedProjectThreadKeys: readonly string[];
  isActive: boolean;
  jumpLabel: string | null;
  appSettingsConfirmThreadArchive: boolean;
  renamingThreadKey: string | null;
  renamingTitle: string;
  setRenamingTitle: (title: string) => void;
  startThreadRename: (threadKey: string, title: string) => void;
  renamingInputRef: React.RefObject<HTMLInputElement | null>;
  renamingCommittedRef: React.RefObject<boolean>;
  confirmingArchiveThreadKey: string | null;
  setConfirmingArchiveThreadKey: React.Dispatch<React.SetStateAction<string | null>>;
  confirmArchiveButtonRefs: React.RefObject<Map<string, HTMLButtonElement>>;
  handleThreadClick: (
    event: React.MouseEvent,
    threadRef: ScopedThreadRef,
    orderedProjectThreadKeys: readonly string[],
  ) => void;
  navigateToThread: (threadRef: ScopedThreadRef) => void;
  handleMultiSelectContextMenu: (position: { x: number; y: number }) => Promise<void>;
  handleThreadContextMenu: (
    threadRef: ScopedThreadRef,
    position: { x: number; y: number },
  ) => Promise<void>;
  clearSelection: () => void;
  commitRename: (
    threadRef: ScopedThreadRef,
    newTitle: string,
    originalTitle: string,
  ) => Promise<void>;
  cancelRename: () => void;
  attemptArchiveThread: (threadRef: ScopedThreadRef) => Promise<void>;
  openPrLink: (event: React.MouseEvent<HTMLElement>, prUrl: string) => void;
}

export const SidebarThreadRow = memo(function SidebarThreadRow(props: SidebarThreadRowProps) {
  const {
    orderedProjectThreadKeys,
    isActive,
    jumpLabel,
    appSettingsConfirmThreadArchive,
    renamingThreadKey,
    renamingTitle,
    setRenamingTitle,
    startThreadRename,
    renamingInputRef,
    renamingCommittedRef,
    confirmingArchiveThreadKey,
    setConfirmingArchiveThreadKey,
    confirmArchiveButtonRefs,
    handleThreadClick,
    navigateToThread,
    handleMultiSelectContextMenu,
    handleThreadContextMenu,
    clearSelection,
    commitRename,
    cancelRename,
    attemptArchiveThread,
    openPrLink,
    thread,
  } = props;
  const threadRef = scopeThreadRef(thread.environmentId, thread.id);
  const threadKey = scopedThreadKey(threadRef);
  const lastVisitedAt = useUiStateStore((state) => state.threadLastVisitedAtById[threadKey]);
  const isSelected = useThreadSelectionStore((state) => state.selectedThreadKeys.has(threadKey));
  const runningTerminalIds = useThreadRunningTerminalIds({
    environmentId: thread.environmentId,
    threadId: thread.id,
  });
  const isMobile = useMediaQuery("max-md");
  const discoveredPorts = useThreadDiscoveredPorts({
    environmentId: thread.environmentId,
    threadId: thread.id,
  });
  const openPreview = useAtomCommand(previewEnvironment.open, {
    reportFailure: false,
  });
  const environment = useEnvironment(thread.environmentId);
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const isRemoteThread =
    primaryEnvironmentId !== null && thread.environmentId !== primaryEnvironmentId;
  const remoteEnvLabel = environment?.label ?? null;
  // A desktop-local secondary backend (e.g. the WSL backend) shows up as a
  // bearer environment whose connection id is prefixed "local:". It runs on the
  // user's own machine, so the cloud icon is misleading — label it "Local" and
  // suppress the cloud icon (the project header already shows a container icon
  // for desktop-local projects, see sidebarProjectGrouping).
  const isDesktopLocalThread =
    environment !== null && isDesktopLocalConnectionTarget(environment.entry.target);
  const threadEnvironmentLabel = isRemoteThread
    ? (remoteEnvLabel ?? (isDesktopLocalThread ? "Local" : "Remote"))
    : null;
  // For grouped projects, the thread may belong to a different environment
  // than the representative project.  Look up the thread's own project cwd
  // so git status (and thus PR detection) queries the correct path.
  const threadProject = useProject(
    useMemo(
      () => scopeProjectRef(thread.environmentId, thread.projectId),
      [thread.environmentId, thread.projectId],
    ),
  );
  const threadProjectCwd = threadProject?.workspaceRoot ?? null;
  const gitCwd = thread.worktreePath ?? threadProjectCwd ?? props.projectCwd;
  const gitStatus = useEnvironmentQuery(
    thread.branch != null && gitCwd !== null
      ? vcsEnvironment.status({
          environmentId: thread.environmentId,
          input: { cwd: gitCwd },
        })
      : null,
  );
  const isHighlighted = isActive || isSelected;
  const handleOpenDiscoveredPort = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      const port = discoveredPorts[0];
      if (!port) return;
      event.preventDefault();
      event.stopPropagation();
      navigateToThread(threadRef);
      void (async () => {
        const result = await openDiscoveredPort({ threadRef, port, openPreview });
        if (result._tag === "Success" || isAtomCommandInterrupted(result)) {
          return;
        }
        const error = squashAtomCommandFailure(result);
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: "Unable to open preview",
            description:
              error instanceof Error ? error.message : "The preview could not be opened.",
          }),
        );
      })();
    },
    [discoveredPorts, navigateToThread, openPreview, threadRef],
  );
  const isThreadRunning = !threadRuntimeCanArchive(thread.runtime);
  const threadStatus = resolveThreadStatusPill({
    thread: {
      ...thread,
      lastVisitedAt,
    },
  });
  const linkedPullRequestStatus = useLinkedThreadPullRequest(
    thread.environmentId,
    thread.linkedPullRequest ?? thread.branchPullRequest,
  );
  const pr = linkedPullRequestStatus?.pr ?? null;
  const prStatus = prStatusIndicator(pr, linkedPullRequestStatus?.sourceControlProvider);
  const terminalStatus = terminalStatusFromRunningIds(runningTerminalIds);
  // A worktree thread owns its working tree, so its diff is the row's headline
  // and outranks the timestamp. Threads on the shared checkout report through
  // the project header instead.
  const threadDiffStat = thread.worktreePath
    ? resolveSidebarWorkspaceDiffStat({ workingTree: gitStatus.data?.workingTree })
    : null;
  const isConfirmingArchive = confirmingArchiveThreadKey === threadKey && !isThreadRunning;
  const threadMetaClassName = isConfirmingArchive
    ? "pointer-events-none opacity-0"
    : !isThreadRunning
      ? "pointer-events-none transition-opacity duration-150 max-sm:pr-6 group-hover/menu-sub-item:opacity-0 group-focus-within/menu-sub-item:opacity-0"
      : "pointer-events-none";
  const clearConfirmingArchive = useCallback(() => {
    setConfirmingArchiveThreadKey((current) => (current === threadKey ? null : current));
  }, [setConfirmingArchiveThreadKey, threadKey]);
  const handleMouseLeave = useCallback(() => {
    clearConfirmingArchive();
  }, [clearConfirmingArchive]);
  const handleBlurCapture = useCallback(
    (event: React.FocusEvent<HTMLLIElement>) => {
      const currentTarget = event.currentTarget;
      requestAnimationFrame(() => {
        if (currentTarget.contains(document.activeElement)) {
          return;
        }
        clearConfirmingArchive();
      });
    },
    [clearConfirmingArchive],
  );
  const handleRowClick = useCallback(
    (event: React.MouseEvent) => {
      handleThreadClick(event, threadRef, orderedProjectThreadKeys);
    },
    [handleThreadClick, orderedProjectThreadKeys, threadRef],
  );
  const handleRowDoubleClick = useCallback(
    (event: React.MouseEvent) => {
      // Already renaming this row: a double-click on the row chrome (outside the
      // input) must not restart and discard the in-progress edit.
      if (renamingThreadKey === threadKey) return;
      // On mobile the first tap navigates and closes the sidebar sheet, so the
      // inline rename can't be shown. Renaming there stays on the context menu.
      if (isMobile) return;
      // cmd/ctrl/shift double-clicks are multi-select intent, not rename.
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      // Ignore double-clicks bubbling from nested controls (PR status, port,
      // archive buttons) — only the row body should enter inline rename.
      if ((event.target as HTMLElement).closest("button, a")) return;
      event.preventDefault();
      startThreadRename(threadKey, thread.title);
    },
    [isMobile, renamingThreadKey, startThreadRename, threadKey, thread.title],
  );
  const handleRowKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      navigateToThread(threadRef);
    },
    [navigateToThread, threadRef],
  );
  const openRowContextMenu = useCallback(
    (position: { readonly x: number; readonly y: number }) => {
      const hasSelection = useThreadSelectionStore.getState().hasSelection();
      if (hasSelection && isSelected) {
        void (async () => {
          const result = await settlePromise(() =>
            handleMultiSelectContextMenu({
              x: position.x,
              y: position.y,
            }),
          );
          if (result._tag === "Failure") {
            const error = squashAtomCommandFailure(result);
            toastManager.add(
              stackedThreadToast({
                type: "error",
                title: "Thread action failed",
                description: error instanceof Error ? error.message : "An error occurred.",
              }),
            );
          }
        })();
        return;
      }

      if (hasSelection) {
        clearSelection();
      }
      void (async () => {
        const result = await settlePromise(() =>
          handleThreadContextMenu(threadRef, {
            x: position.x,
            y: position.y,
          }),
        );
        if (result._tag === "Failure") {
          const error = squashAtomCommandFailure(result);
          toastManager.add(
            stackedThreadToast({
              type: "error",
              title: "Thread action failed",
              description: error instanceof Error ? error.message : "An error occurred.",
            }),
          );
        }
      })();
    },
    [clearSelection, handleMultiSelectContextMenu, handleThreadContextMenu, isSelected, threadRef],
  );
  const handleRowContextMenu = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      openRowContextMenu({ x: event.clientX, y: event.clientY });
    },
    [openRowContextMenu],
  );
  const rowLongPressHandlers = useLongPressContextMenu(openRowContextMenu);
  const handlePrClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      if (!prStatus) return;
      openPrLink(event, prStatus.url);
    },
    [openPrLink, prStatus],
  );
  const handleRenameInputRef = useCallback(
    (element: HTMLInputElement | null) => {
      if (element && renamingInputRef.current !== element) {
        renamingInputRef.current = element;
        element.focus();
        element.select();
      }
    },
    [renamingInputRef],
  );
  const handleRenameInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setRenamingTitle(event.target.value);
    },
    [setRenamingTitle],
  );
  const handleRenameInputKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      event.stopPropagation();
      if (event.key === "Enter") {
        event.preventDefault();
        renamingCommittedRef.current = true;
        void commitRename(threadRef, renamingTitle, thread.title);
      } else if (event.key === "Escape") {
        event.preventDefault();
        renamingCommittedRef.current = true;
        cancelRename();
      }
    },
    [cancelRename, commitRename, renamingCommittedRef, renamingTitle, thread.title, threadRef],
  );
  const handleRenameInputBlur = useCallback(() => {
    if (!renamingCommittedRef.current) {
      void commitRename(threadRef, renamingTitle, thread.title);
    }
  }, [commitRename, renamingCommittedRef, renamingTitle, thread.title, threadRef]);
  // Keep clicks/double-clicks inside the rename input from bubbling to the row.
  // Without stopping `dblclick`, double-clicking to select a word would re-fire
  // the row's rename handler and reset the in-progress edit back to the title.
  const handleRenameInputClick = useCallback((event: React.MouseEvent<HTMLInputElement>) => {
    event.stopPropagation();
  }, []);
  const handleConfirmArchiveRef = useCallback(
    (element: HTMLButtonElement | null) => {
      if (element) {
        confirmArchiveButtonRefs.current.set(threadKey, element);
      } else {
        confirmArchiveButtonRefs.current.delete(threadKey);
      }
    },
    [confirmArchiveButtonRefs, threadKey],
  );
  const stopPropagationOnPointerDown = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      event.stopPropagation();
    },
    [],
  );
  const handleConfirmArchiveClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      clearConfirmingArchive();
      void attemptArchiveThread(threadRef);
    },
    [attemptArchiveThread, clearConfirmingArchive, threadRef],
  );
  const handleStartArchiveConfirmation = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      setConfirmingArchiveThreadKey(threadKey);
      requestAnimationFrame(() => {
        confirmArchiveButtonRefs.current.get(threadKey)?.focus();
      });
    },
    [confirmArchiveButtonRefs, setConfirmingArchiveThreadKey, threadKey],
  );
  const handleArchiveImmediateClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      void attemptArchiveThread(threadRef);
    },
    [attemptArchiveThread, threadRef],
  );
  const rowButtonRender = useMemo(() => <div role="button" tabIndex={0} />, []);

  return (
    <SidebarMenuSubItem
      className="w-full"
      data-thread-item
      onMouseLeave={handleMouseLeave}
      onBlurCapture={handleBlurCapture}
    >
      <SidebarMenuSubButton
        render={rowButtonRender}
        size="sm"
        isActive={isActive}
        data-testid={`thread-row-${thread.id}`}
        className={`${resolveThreadRowClassName({
          isActive,
          isSelected,
        })} relative isolate`}
        style={LONG_PRESS_TARGET_STYLE}
        onClick={handleRowClick}
        onDoubleClick={handleRowDoubleClick}
        onKeyDown={handleRowKeyDown}
        onContextMenu={handleRowContextMenu}
        {...rowLongPressHandlers}
      >
        <div className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
          {prStatus && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    aria-label={prStatus.tooltip}
                    className={`inline-flex items-center justify-center ${prStatus.colorClass} cursor-pointer rounded-sm outline-hidden focus-visible:ring-1 focus-visible:ring-ring`}
                    onClick={handlePrClick}
                  >
                    <ChangeRequestStatusIcon
                      state={pr?.state ?? "open"}
                      isDraft={pr?.isDraft ?? false}
                      className="size-3"
                    />
                  </button>
                }
              />
              <TooltipPopup side="top">
                <PrStatusTooltipContent status={prStatus} />
              </TooltipPopup>
            </Tooltip>
          )}
          {threadStatus && <ThreadStatusLabel status={threadStatus} />}
          {renamingThreadKey === threadKey ? (
            <input
              ref={handleRenameInputRef}
              className="min-w-0 flex-1 truncate rounded border border-ring bg-transparent px-0.5 text-sm outline-none"
              value={renamingTitle}
              onChange={handleRenameInputChange}
              onKeyDown={handleRenameInputKeyDown}
              onBlur={handleRenameInputBlur}
              onClick={handleRenameInputClick}
              onDoubleClick={handleRenameInputClick}
            />
          ) : (
            <Tooltip>
              <TooltipTrigger
                render={
                  <span
                    className="min-w-0 flex-1 truncate text-sm"
                    data-testid={`thread-title-${thread.id}`}
                  >
                    {thread.title}
                  </span>
                }
              />
              <TooltipPopup side="top" className="max-w-80 whitespace-normal leading-tight">
                {thread.title}
              </TooltipPopup>
            </Tooltip>
          )}
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {discoveredPorts.length > 0 && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    aria-label={`Open localhost:${discoveredPorts[0]?.port ?? ""}`}
                    className="inline-flex cursor-pointer items-center justify-center text-emerald-600 outline-hidden focus-visible:ring-1 focus-visible:ring-ring dark:text-emerald-400"
                    onClick={handleOpenDiscoveredPort}
                  />
                }
              >
                <Globe2Icon className="size-3" />
              </TooltipTrigger>
              <TooltipPopup side="top">
                Open localhost:{discoveredPorts[0]?.port}
                {discoveredPorts.length > 1 ? ` (+${discoveredPorts.length - 1})` : ""}
              </TooltipPopup>
            </Tooltip>
          )}
          <ThreadWorktreeIndicator thread={thread} />
          {terminalStatus && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <span
                    role="img"
                    aria-label={terminalStatus.label}
                    className={`inline-flex items-center justify-center ${terminalStatus.colorClass}`}
                  />
                }
              >
                <TerminalIcon
                  className={`size-3 ${terminalStatus.pulse ? "animate-status-pulse" : ""}`}
                />
              </TooltipTrigger>
              <TooltipPopup side="top">{terminalStatus.label}</TooltipPopup>
            </Tooltip>
          )}
          <div
            className={`flex min-w-12 justify-end ${
              isRemoteThread ? "max-sm:min-w-24" : "max-sm:min-w-20"
            }`}
          >
            {isConfirmingArchive ? (
              <button
                ref={handleConfirmArchiveRef}
                type="button"
                data-thread-selection-safe
                data-testid={`thread-archive-confirm-${thread.id}`}
                aria-label={`Confirm archive ${thread.title}`}
                className="absolute top-1/2 right-1 inline-flex h-5 -translate-y-1/2 cursor-pointer items-center rounded-md bg-destructive/12 px-2 text-[10px] font-medium text-destructive transition-colors hover:bg-destructive/18 focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-destructive/40"
                onPointerDown={stopPropagationOnPointerDown}
                onClick={handleConfirmArchiveClick}
              >
                Confirm
              </button>
            ) : !isThreadRunning ? (
              appSettingsConfirmThreadArchive ? (
                <div className="pointer-events-none absolute top-1/2 right-0.5 -translate-y-1/2 opacity-0 transition-opacity duration-150 max-sm:pointer-events-auto max-sm:opacity-100 group-hover/menu-sub-item:pointer-events-auto group-hover/menu-sub-item:opacity-100 group-focus-within/menu-sub-item:pointer-events-auto group-focus-within/menu-sub-item:opacity-100">
                  <button
                    type="button"
                    data-thread-selection-safe
                    data-testid={`thread-archive-${thread.id}`}
                    aria-label={`Archive ${thread.title}`}
                    className={SIDEBAR_ICON_ACTION_BUTTON_CLASS}
                    onPointerDown={stopPropagationOnPointerDown}
                    onClick={handleStartArchiveConfirmation}
                  >
                    <ArchiveIcon className="size-3.5" />
                  </button>
                </div>
              ) : (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <div className="pointer-events-none absolute top-1/2 right-0.5 -translate-y-1/2 opacity-0 transition-opacity duration-150 max-sm:pointer-events-auto max-sm:opacity-100 group-hover/menu-sub-item:pointer-events-auto group-hover/menu-sub-item:opacity-100 group-focus-within/menu-sub-item:pointer-events-auto group-focus-within/menu-sub-item:opacity-100">
                        <button
                          type="button"
                          data-thread-selection-safe
                          data-testid={`thread-archive-${thread.id}`}
                          aria-label={`Archive ${thread.title}`}
                          className={SIDEBAR_ICON_ACTION_BUTTON_CLASS}
                          onPointerDown={stopPropagationOnPointerDown}
                          onClick={handleArchiveImmediateClick}
                        >
                          <ArchiveIcon className="size-3.5" />
                        </button>
                      </div>
                    }
                  />
                  <TooltipPopup side="top">Archive</TooltipPopup>
                </Tooltip>
              )
            ) : null}
            <span className={threadMetaClassName}>
              <span className="inline-flex items-center gap-1">
                {isRemoteThread && !isDesktopLocalThread && (
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <span
                          aria-label={threadEnvironmentLabel ?? "Remote"}
                          className="inline-flex items-center justify-center"
                        />
                      }
                    >
                      <CloudIcon className="size-3 text-muted-foreground/40" />
                    </TooltipTrigger>
                    <TooltipPopup side="top">{threadEnvironmentLabel}</TooltipPopup>
                  </Tooltip>
                )}
                {jumpLabel ? (
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <span
                          aria-label={jumpLabel}
                          className="inline-flex h-5 items-center rounded-full border border-border/80 bg-background/90 px-1.5 font-mono text-[10px] font-medium tracking-tight text-foreground shadow-sm"
                        />
                      }
                    >
                      {jumpLabel}
                    </TooltipTrigger>
                    <TooltipPopup side="top">{jumpLabel}</TooltipPopup>
                  </Tooltip>
                ) : threadDiffStat ? (
                  <DiffStatLabel
                    layout="inline"
                    additions={threadDiffStat.additions}
                    deletions={threadDiffStat.deletions}
                    className="gap-0.5 text-[10px]"
                  />
                ) : (
                  <span
                    className={`text-[10px] tabular-nums ${
                      isHighlighted
                        ? "text-foreground/72 dark:text-foreground/82"
                        : "text-muted-foreground/40"
                    }`}
                  >
                    {formatRelativeTimeLabel(
                      thread.latestUserMessageAt ?? thread.updatedAt ?? thread.createdAt,
                    )}
                  </span>
                )}
              </span>
            </span>
          </div>
        </div>
      </SidebarMenuSubButton>
    </SidebarMenuSubItem>
  );
});

interface SidebarProjectThreadListProps {
  workspaces: readonly ProjectWorkspace[];
  workspaceThreadByKey: ReadonlyMap<string, SidebarThreadSummary>;
  handleNewThread: ReturnType<typeof useNewThreadHandler>;
  projectKey: string;
  projectExpanded: boolean;
  hasOverflowingThreads: boolean;
  hiddenThreadStatus: ThreadStatusPill | null;
  orderedProjectThreadKeys: readonly string[];
  renderedThreads: readonly SidebarThreadSummary[];
  showEmptyThreadState: boolean;
  shouldShowThreadPanel: boolean;
  isThreadListExpanded: boolean;
  projectCwd: string;
  activeRouteThreadKey: string | null;
  threadJumpLabelByKey: ReadonlyMap<string, string>;
  appSettingsConfirmThreadArchive: boolean;
  renamingThreadKey: string | null;
  renamingTitle: string;
  setRenamingTitle: (title: string) => void;
  startThreadRename: (threadKey: string, title: string) => void;
  renamingInputRef: React.RefObject<HTMLInputElement | null>;
  renamingCommittedRef: React.RefObject<boolean>;
  confirmingArchiveThreadKey: string | null;
  setConfirmingArchiveThreadKey: React.Dispatch<React.SetStateAction<string | null>>;
  confirmArchiveButtonRefs: React.RefObject<Map<string, HTMLButtonElement>>;
  attachThreadListAutoAnimateRef: (node: HTMLElement | null) => void;
  handleThreadClick: (
    event: React.MouseEvent,
    threadRef: ScopedThreadRef,
    orderedProjectThreadKeys: readonly string[],
  ) => void;
  navigateToThread: (threadRef: ScopedThreadRef) => void;
  handleMultiSelectContextMenu: (position: { x: number; y: number }) => Promise<void>;
  handleThreadContextMenu: (
    threadRef: ScopedThreadRef,
    position: { x: number; y: number },
  ) => Promise<void>;
  clearSelection: () => void;
  commitRename: (
    threadRef: ScopedThreadRef,
    newTitle: string,
    originalTitle: string,
  ) => Promise<void>;
  cancelRename: () => void;
  attemptArchiveThread: (threadRef: ScopedThreadRef) => Promise<void>;
  openPrLink: (event: React.MouseEvent<HTMLElement>, prUrl: string) => void;
  expandThreadListForProject: (projectKey: string) => void;
  collapseThreadListForProject: (projectKey: string) => void;
}

const SidebarWorkspaceRow = memo(function SidebarWorkspaceRow(props: {
  workspace: ProjectWorkspace;
  status: ReturnType<typeof resolveSidebarWorkspaceStatus>;
  /** How many chats here still show a status only a refresh can clear. */
  refreshCount: number;
  refreshStatus: (workspace: ProjectWorkspace) => void;
  handleNewThread: ReturnType<typeof useNewThreadHandler>;
  showProjectIcon?: boolean;
  /** False where the same workspace is listed again, so its tabs appear once. */
  showTabs?: boolean;
}) {
  const {
    workspace,
    status,
    refreshCount,
    refreshStatus,
    handleNewThread,
    showProjectIcon = false,
    showTabs = true,
  } = props;
  const openThreadTab = useOpenThreadTab();
  const { isMobile, setOpenMobile } = useSidebar();
  const {
    customName,
    isPinned,
    isArchived,
    renameWorkspace,
    toggleWorkspacePinned,
    toggleWorkspaceArchived,
  } = useWorkspaceSidebarStore(
    useShallow((state) => ({
      customName: state.namesByWorkspaceKey[workspace.key] ?? null,
      isPinned: state.pinnedWorkspaceKeys.includes(workspace.key),
      isArchived: state.archivedWorkspaceKeys.includes(workspace.key),
      renameWorkspace: state.renameWorkspace,
      toggleWorkspacePinned: state.toggleWorkspacePinned,
      toggleWorkspaceArchived: state.toggleWorkspaceArchived,
    })),
  );
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameDraft, setRenameDraft] = useState("");
  const gitStatus = useEnvironmentQuery(
    vcsEnvironment.status({
      environmentId: workspace.projectRef.environmentId,
      input: { cwd: workspace.cwd },
    }),
  );
  const fallbackLabel =
    gitStatus.data?.refName ??
    workspaceFallbackLabel({
      worktreePath: workspace.worktreePath,
      branch: workspace.branch,
    });
  const label = customName ?? fallbackLabel;
  const diffStat = resolveSidebarWorkspaceDiffStat({
    workingTree: gitStatus.data?.workingTree,
  });
  const isActive = useThreadTabsStore((state) => state.activeWorkspaceKey === workspace.key);
  const openTabCount = useThreadTabsStore(
    (state) => selectWorkspaceThreadTabs(state, workspace.key).tabs.length,
  );
  const tabListOverride = useWorkspaceTabListStore(
    (state) => state.expandedByWorkspaceKey[workspace.key],
  );
  const setTabListExpanded = useWorkspaceTabListStore((state) => state.setTabListExpanded);
  const hasTabList = showTabs && openTabCount > 0;
  const tabListExpanded = hasTabList && resolveWorkspaceTabListExpanded(tabListOverride, isActive);
  const rowButtonRender = useMemo(() => <button type="button" />, []);

  const startNewThread = useCallback(() => {
    if (isMobile) setOpenMobile(false);
    void handleNewThread(workspace.projectRef, {
      branch: gitStatus.data?.refName ?? workspace.branch,
      worktreePath: workspace.worktreePath,
      envMode: workspace.worktreePath === null ? "local" : "worktree",
      startFromOrigin: false,
      forceNew: true,
    });
  }, [gitStatus.data?.refName, handleNewThread, isMobile, setOpenMobile, workspace]);

  const toggleTabList = useCallback(() => {
    setTabListExpanded(workspace.key, !tabListExpanded);
  }, [setTabListExpanded, tabListExpanded, workspace.key]);

  const handleClick = useCallback(() => {
    const tabs = selectWorkspaceThreadTabs(useThreadTabsStore.getState(), workspace.key);
    const session = selectWorkspaceEntrySession({
      sessions: workspace.sessions,
      activeTabKey: tabs.activeKey,
    });
    if (session) {
      if (isMobile) setOpenMobile(false);
      openThreadTab(session);
      return;
    }

    startNewThread();
  }, [isMobile, openThreadTab, setOpenMobile, startNewThread, workspace]);

  const openRenameDialog = useCallback(() => {
    setRenameDraft(label);
    setRenameDialogOpen(true);
  }, [label]);

  const submitRename = useCallback(() => {
    const nextName = renameDraft.trim();
    if (!nextName) return;
    renameWorkspace(workspace.key, nextName);
    setRenameDialogOpen(false);
  }, [renameDraft, renameWorkspace, workspace.key]);

  const openWorkspaceContextMenu = useCallback(
    (position: { readonly x: number; readonly y: number }) => {
      void (async () => {
        const api = readLocalApi();
        if (!api) return;
        const action = await api.contextMenu.show(
          buildWorkspaceContextMenuItems({ isPinned, isArchived, staleStatusCount: refreshCount }),
          { x: position.x, y: position.y },
        );
        if (action === "refresh-status") {
          refreshStatus(workspace);
        } else if (action === "rename") {
          openRenameDialog();
        } else if (action === "toggle-pin") {
          toggleWorkspacePinned(workspace.key);
        } else if (action === "toggle-archive") {
          toggleWorkspaceArchived(workspace.key);
        }
      })();
    },
    [
      isArchived,
      isPinned,
      openRenameDialog,
      refreshCount,
      refreshStatus,
      toggleWorkspaceArchived,
      toggleWorkspacePinned,
      workspace,
    ],
  );

  const handleContextMenu = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      event.preventDefault();
      event.stopPropagation();
      openWorkspaceContextMenu({ x: event.clientX, y: event.clientY });
    },
    [openWorkspaceContextMenu],
  );
  const workspaceLongPressHandlers = useLongPressContextMenu(openWorkspaceContextMenu);

  return (
    <>
      <SidebarMenuSubItem
        className="w-full"
        data-workspace-kind={workspace.worktreePath ? "worktree" : "base"}
      >
        {/* The row's own actions sit beside the row button rather than inside
            it, since a button cannot hold other buttons. They show on the
            workspace you are in, and on hover or focus for the rest. */}
        <div className="group/workspace-row relative">
          <SidebarMenuSubButton
            render={rowButtonRender}
            size="sm"
            // An open tab list highlights the chat itself, so the row steps back.
            isActive={isActive && !tabListExpanded}
            data-testid="workspace-row"
            data-workspace-key={workspace.key}
            className="h-8 w-full translate-x-0 select-none gap-1.5 px-2 text-left"
            style={LONG_PRESS_TARGET_STYLE}
            onClick={handleClick}
            onContextMenu={handleContextMenu}
            {...workspaceLongPressHandlers}
          >
            {/* Room for the tab-list toggle laid over the row's leading edge. */}
            <span aria-hidden className="w-3.5 shrink-0" />
            {showProjectIcon ? (
              <ProjectFavicon
                project={{
                  environmentId: workspace.projectRef.environmentId,
                  workspaceRoot: workspace.projectRoot,
                  title: workspace.projectRoot.split("/").pop() ?? "",
                }}
              />
            ) : null}
            <SidebarWorkspaceStatusIcon status={status} />
            <Tooltip>
              <TooltipTrigger
                render={
                  <span
                    className={`min-w-0 flex-1 truncate text-xs ${
                      isActive ? "text-sidebar-foreground/85" : "text-sidebar-foreground/55"
                    }`}
                  >
                    {label}
                  </span>
                }
              />
              <TooltipPopup side="top" className="max-w-96 break-all">
                {workspace.cwd}
              </TooltipPopup>
            </Tooltip>
            {diffStat ? (
              <DiffStatLabel
                layout="inline"
                additions={diffStat.additions}
                deletions={diffStat.deletions}
                className={cn(
                  "ml-auto gap-0.5 text-3xs",
                  workspaceRowRevealClass({ isActive, revealed: "hidden" }),
                )}
              />
            ) : null}
            {/* Room for the row actions laid over the trailing edge. */}
            <span
              aria-hidden
              className={cn(
                "w-12 shrink-0 sm:w-10",
                workspaceRowRevealClass({ isActive, revealed: "block" }),
              )}
            />
          </SidebarMenuSubButton>
          {hasTabList ? (
            <button
              type="button"
              aria-expanded={tabListExpanded}
              aria-label={`Open chats in ${label}`}
              data-testid="workspace-tab-list-toggle"
              className="absolute top-1/2 left-1 inline-flex size-5 -translate-y-1/2 cursor-pointer items-center justify-center rounded text-muted-foreground/60 transition-colors hover:bg-sidebar-row-active hover:text-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
              onClick={toggleTabList}
            >
              <ChevronRightIcon
                className={cn(
                  "size-3.5 transition-transform duration-150",
                  tabListExpanded && "rotate-90",
                )}
              />
            </button>
          ) : null}
          <SidebarWorkspaceRowActions
            workspaceKey={workspace.key}
            projectRef={workspace.projectRef}
            workspaceLabel={label}
            onNewThread={startNewThread}
            className={cn(
              "absolute top-1/2 right-1 -translate-y-1/2",
              workspaceRowRevealClass({ isActive, revealed: "flex" }),
            )}
          />
        </div>
        {tabListExpanded ? (
          <SidebarWorkspaceTabList
            workspaceKey={workspace.key}
            workspaceLabel={label}
            onNewThread={startNewThread}
          />
        ) : null}
      </SidebarMenuSubItem>

      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogPopup className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Rename workspace</DialogTitle>
            <DialogDescription>
              Change the sidebar label for this workspace. The Git branch and folder stay the same.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel>
            <Input
              aria-label="Workspace name"
              autoFocus
              value={renameDraft}
              onChange={(event) => setRenameDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  submitRename();
                }
              }}
            />
          </DialogPanel>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameDialogOpen(false)}>
              Cancel
            </Button>
            <Button disabled={!renameDraft.trim()} onClick={submitRename}>
              Save
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </>
  );
});

const SidebarProjectThreadList = memo(function SidebarProjectThreadList(
  props: SidebarProjectThreadListProps,
) {
  const { workspaces, workspaceThreadByKey, projectExpanded, handleNewThread } = props;
  const archivedWorkspaceKeys = useWorkspaceSidebarStore((state) => state.archivedWorkspaceKeys);
  const pinnedWorkspaceKeys = useWorkspaceSidebarStore((state) => state.pinnedWorkspaceKeys);
  const visibleWorkspaces = useMemo(
    () => workspaces.filter((workspace) => !archivedWorkspaceKeys.includes(workspace.key)),
    [archivedWorkspaceKeys, workspaces],
  );
  const { statusByKey, refreshCountByKey } = useWorkspaceStatusByKey(
    visibleWorkspaces,
    workspaceThreadByKey,
  );
  const refreshWorkspaceStatus = useWorkspaceStatusRefresh(workspaceThreadByKey);

  return (
    <SidebarMenuSub className="mx-0.5 my-0 w-full translate-x-0 gap-0.5 overflow-hidden border-l-0 px-1 py-0 sm:mx-1 sm:px-1.5">
      {projectExpanded
        ? visibleWorkspaces.map((workspace) => (
            <SidebarWorkspaceRow
              key={workspace.key}
              workspace={workspace}
              status={statusByKey.get(workspace.key) ?? "ready"}
              refreshCount={refreshCountByKey.get(workspace.key) ?? 0}
              refreshStatus={refreshWorkspaceStatus}
              handleNewThread={handleNewThread}
              showTabs={!pinnedWorkspaceKeys.includes(workspace.key)}
            />
          ))
        : null}
    </SidebarMenuSub>
  );
});

const SidebarWorkspaceList = memo(function SidebarWorkspaceList(props: {
  workspaces: readonly ProjectWorkspace[];
  workspaceThreadByKey: ReadonlyMap<string, SidebarThreadSummary>;
  handleNewThread: ReturnType<typeof useNewThreadHandler>;
  showProjectIcon?: boolean;
  showTabs?: boolean;
}) {
  const {
    workspaces,
    workspaceThreadByKey,
    handleNewThread,
    showProjectIcon = false,
    showTabs = true,
  } = props;
  const { statusByKey, refreshCountByKey } = useWorkspaceStatusByKey(
    workspaces,
    workspaceThreadByKey,
  );
  const refreshWorkspaceStatus = useWorkspaceStatusRefresh(workspaceThreadByKey);

  return (
    <SidebarMenuSub className="mx-0.5 my-0 w-full translate-x-0 gap-0.5 overflow-hidden border-l-0 px-1 py-0 sm:mx-1 sm:px-1.5">
      {workspaces.map((workspace) => (
        <SidebarWorkspaceRow
          key={workspace.key}
          workspace={workspace}
          status={statusByKey.get(workspace.key) ?? "ready"}
          refreshCount={refreshCountByKey.get(workspace.key) ?? 0}
          refreshStatus={refreshWorkspaceStatus}
          handleNewThread={handleNewThread}
          showProjectIcon={showProjectIcon}
          showTabs={showTabs}
        />
      ))}
    </SidebarMenuSub>
  );
});

interface SidebarProjectItemProps {
  project: SidebarProjectSnapshot;
  projectWorkspaces: readonly ProjectWorkspace[];
  isThreadListExpanded: boolean;
  activeRouteThreadKey: string | null;
  newThreadShortcutLabel: string | null;
  handleNewThread: ReturnType<typeof useNewThreadHandler>;
  archiveThread: ReturnType<typeof useThreadActions>["archiveThread"];
  deleteThread: ReturnType<typeof useThreadActions>["deleteThread"];
  threadJumpLabelByKey: ReadonlyMap<string, string>;
  attachThreadListAutoAnimateRef: (node: HTMLElement | null) => void;
  expandThreadListForProject: (projectKey: string) => void;
  collapseThreadListForProject: (projectKey: string) => void;
  dragInProgressRef: React.RefObject<boolean>;
  suppressProjectClickAfterDragRef: React.RefObject<boolean>;
  suppressProjectClickForContextMenuRef: React.RefObject<boolean>;
  isManualProjectSorting: boolean;
  dragHandleProps: SortableProjectHandleProps | null;
}

const SidebarProjectItem = memo(function SidebarProjectItem(props: SidebarProjectItemProps) {
  const {
    project,
    projectWorkspaces,
    isThreadListExpanded,
    activeRouteThreadKey,
    newThreadShortcutLabel,
    handleNewThread,
    archiveThread,
    deleteThread,
    threadJumpLabelByKey,
    attachThreadListAutoAnimateRef,
    expandThreadListForProject,
    collapseThreadListForProject,
    dragInProgressRef,
    suppressProjectClickAfterDragRef,
    suppressProjectClickForContextMenuRef,
    isManualProjectSorting,
    dragHandleProps,
  } = props;
  const threadSortOrder = useClientSettings<SidebarThreadSortOrder>(
    (settings) => settings.sidebarThreadSortOrder,
  );
  const appSettingsConfirmThreadDelete = useClientSettings<boolean>(
    (settings) => settings.confirmThreadDelete,
  );
  const appSettingsConfirmThreadArchive = useClientSettings<boolean>(
    (settings) => settings.confirmThreadArchive,
  );
  const projectGroupingSettings = useClientSettings(selectProjectGroupingSettings);
  const hiddenProjectKeys = useClientSettings((settings) => settings.sidebarHiddenProjectKeys);
  const isProjectHidden = hiddenProjectKeys.includes(project.projectKey);
  const projectGroups = useClientSettings((settings) => settings.sidebarProjectGroups);
  const deleteProject = useAtomCommand(projectEnvironment.delete, {
    reportFailure: false,
  });
  const updateProject = useAtomCommand(projectEnvironment.update, {
    reportFailure: false,
  });
  const updateThreadMetadata = useAtomCommand(threadEnvironment.updateMetadata, {
    reportFailure: false,
  });
  const updateSettings = useUpdateClientSettings();
  const sidebarThreadPreviewCount = useClientSettings<SidebarThreadPreviewCount>(
    (settings) => settings.sidebarThreadPreviewCount,
  );
  const router = useRouter();
  const { isMobile, setOpenMobile } = useSidebar();
  // Server-side on environments that track visits, browser-local otherwise.
  const { markThreadUnread } = useThreadActions();
  const setProjectExpanded = useUiStateStore((state) => state.setProjectExpanded);
  const toggleThreadSelection = useThreadSelectionStore((state) => state.toggleThread);
  const rangeSelectTo = useThreadSelectionStore((state) => state.rangeSelectTo);
  const clearSelection = useThreadSelectionStore((state) => state.clearSelection);
  const removeFromSelection = useThreadSelectionStore((state) => state.removeFromSelection);
  const setSelectionAnchor = useThreadSelectionStore((state) => state.setAnchor);
  const { copyToClipboard: copyThreadIdToClipboard } = useCopyToClipboard<{
    threadId: ThreadId;
  }>({
    onCopy: (ctx) => {
      toastManager.add({
        type: "success",
        title: "Thread ID copied",
        description: ctx.threadId,
      });
    },
    onError: (error) => {
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: "Failed to copy thread ID",
          description: error instanceof Error ? error.message : "An error occurred.",
        }),
      );
    },
  });
  const { copyToClipboard: copyPathToClipboard } = useCopyToClipboard<{
    path: string;
  }>({
    onCopy: (ctx) => {
      toastManager.add({
        type: "success",
        title: "Path copied",
        description: ctx.path,
      });
    },
    onError: (error) => {
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: "Failed to copy path",
          description: error instanceof Error ? error.message : "An error occurred.",
        }),
      );
    },
  });
  const openPrLink = useOpenPrLink();
  const sidebarThreads = useThreadShellsForProjectRefs(project.memberProjectRefs);
  const sidebarThreadByKey = useMemo(
    () =>
      new Map(
        sidebarThreads.map(
          (thread) =>
            [scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)), thread] as const,
        ),
      ),
    [sidebarThreads],
  );
  // Keep a ref so callbacks can read the latest map without appearing in
  // dependency arrays (avoids invalidating every thread-row memo on each
  // thread-list change).
  const sidebarThreadByKeyRef = useRef(sidebarThreadByKey);
  sidebarThreadByKeyRef.current = sidebarThreadByKey;
  const projectThreads = sidebarThreads;
  const projectPreferenceKeys = useMemo(() => projectExpansionPreferenceKeys(project), [project]);
  const projectExpanded = useUiStateStore((state) =>
    resolveProjectExpanded(state.projectExpandedById, projectPreferenceKeys),
  );
  const threadLastVisitedAts = useUiStateStore(
    useShallow((state) =>
      projectThreads.map(
        (thread) =>
          state.threadLastVisitedAtById[
            scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id))
          ] ?? null,
      ),
    ),
  );
  const [renamingThreadKey, setRenamingThreadKey] = useState<string | null>(null);
  const [renamingTitle, setRenamingTitle] = useState("");
  const [confirmingArchiveThreadKey, setConfirmingArchiveThreadKey] = useState<string | null>(null);
  const [projectRenameTarget, setProjectRenameTarget] = useState<SidebarProjectGroupMember | null>(
    null,
  );
  const [projectRenameTitle, setProjectRenameTitle] = useState("");
  const [projectGroupingTarget, setProjectGroupingTarget] =
    useState<SidebarProjectGroupMember | null>(null);
  const [projectGroupingSelection, setProjectGroupingSelection] = useState<
    SidebarProjectGroupingMode | "inherit"
  >("inherit");
  const [isNewProjectGroupDialogOpen, setIsNewProjectGroupDialogOpen] = useState(false);
  const [newProjectGroupName, setNewProjectGroupName] = useState("");
  const renamingCommittedRef = useRef(false);
  const renamingInputRef = useRef<HTMLInputElement | null>(null);
  const confirmArchiveButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const memberProjectByScopedKey = useMemo(
    () =>
      new Map(
        project.memberProjects.map((member) => [
          scopedProjectKey(scopeProjectRef(member.environmentId, member.id)),
          member,
        ]),
      ),
    [project.memberProjects],
  );
  const memberThreadCountByPhysicalKey = useMemo(() => {
    const counts = new Map<string, number>(
      project.memberProjects.map((member) => [member.physicalProjectKey, 0] as const),
    );
    for (const thread of projectThreads) {
      const member = memberProjectByScopedKey.get(
        scopedProjectKey(scopeProjectRef(thread.environmentId, thread.projectId)),
      );
      if (!member) {
        continue;
      }
      counts.set(member.physicalProjectKey, (counts.get(member.physicalProjectKey) ?? 0) + 1);
    }
    return counts;
  }, [memberProjectByScopedKey, project.memberProjects, projectThreads]);

  const { projectStatus, visibleProjectThreads, orderedProjectThreadKeys } = useMemo(() => {
    const lastVisitedAtByThreadKey = new Map(
      projectThreads.map((thread, index) => [
        scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)),
        threadLastVisitedAts[index] ?? null,
      ]),
    );
    const resolveProjectThreadStatus = (thread: SidebarThreadSummary) => {
      const lastVisitedAt = lastVisitedAtByThreadKey.get(
        scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)),
      );
      return resolveThreadStatusPill({
        thread: {
          ...thread,
          ...(lastVisitedAt !== null && lastVisitedAt !== undefined ? { lastVisitedAt } : {}),
        },
      });
    };
    const visibleProjectThreads = sortThreads(
      projectThreads.filter((thread) => thread.archivedAt === null),
      threadSortOrder,
    );
    const projectStatus = resolveProjectStatusIndicator(
      visibleProjectThreads.map((thread) => resolveProjectThreadStatus(thread)),
    );
    return {
      orderedProjectThreadKeys: visibleProjectThreads.map((thread) =>
        scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)),
      ),
      projectStatus,
      visibleProjectThreads,
    };
  }, [projectThreads, threadLastVisitedAts, threadSortOrder]);
  const pinnedCollapsedThread = useMemo(() => {
    const activeThreadKey = activeRouteThreadKey ?? undefined;
    if (!activeThreadKey || projectExpanded) {
      return null;
    }
    return (
      visibleProjectThreads.find(
        (thread) =>
          scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)) === activeThreadKey,
      ) ?? null
    );
  }, [activeRouteThreadKey, projectExpanded, visibleProjectThreads]);

  const {
    hasOverflowingThreads,
    hiddenThreadStatus,
    renderedThreads,
    showEmptyThreadState,
    shouldShowThreadPanel,
  } = useMemo(() => {
    const lastVisitedAtByThreadKey = new Map(
      projectThreads.map((thread, index) => [
        scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)),
        threadLastVisitedAts[index] ?? null,
      ]),
    );
    const resolveProjectThreadStatus = (thread: SidebarThreadSummary) => {
      const lastVisitedAt = lastVisitedAtByThreadKey.get(
        scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)),
      );
      return resolveThreadStatusPill({
        thread: {
          ...thread,
          ...(lastVisitedAt !== null && lastVisitedAt !== undefined ? { lastVisitedAt } : {}),
        },
      });
    };
    const hasOverflowingThreads = visibleProjectThreads.length > sidebarThreadPreviewCount;
    const previewThreads =
      isThreadListExpanded || !hasOverflowingThreads
        ? visibleProjectThreads
        : visibleProjectThreads.slice(0, sidebarThreadPreviewCount);
    const visibleThreadKeys = new Set(
      [...previewThreads, ...(pinnedCollapsedThread ? [pinnedCollapsedThread] : [])].map((thread) =>
        scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)),
      ),
    );
    const renderedThreads = pinnedCollapsedThread
      ? [pinnedCollapsedThread]
      : visibleProjectThreads.filter((thread) =>
          visibleThreadKeys.has(scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id))),
        );
    const hiddenThreads = visibleProjectThreads.filter(
      (thread) =>
        !visibleThreadKeys.has(scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id))),
    );
    return {
      hasOverflowingThreads,
      hiddenThreadStatus: resolveProjectStatusIndicator(
        hiddenThreads.map((thread) => resolveProjectThreadStatus(thread)),
      ),
      renderedThreads,
      showEmptyThreadState: projectExpanded && visibleProjectThreads.length === 0,
      shouldShowThreadPanel: projectExpanded || pinnedCollapsedThread !== null,
    };
  }, [
    isThreadListExpanded,
    pinnedCollapsedThread,
    projectExpanded,
    projectThreads,
    sidebarThreadPreviewCount,
    threadLastVisitedAts,
    visibleProjectThreads,
  ]);

  const handleProjectButtonClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      if (suppressProjectClickForContextMenuRef.current) {
        suppressProjectClickForContextMenuRef.current = false;
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (dragInProgressRef.current) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (suppressProjectClickAfterDragRef.current) {
        suppressProjectClickAfterDragRef.current = false;
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (useThreadSelectionStore.getState().hasSelection()) {
        clearSelection();
      }
      setProjectExpanded(projectPreferenceKeys, !projectExpanded);
    },
    [
      clearSelection,
      dragInProgressRef,
      projectExpanded,
      projectPreferenceKeys,
      setProjectExpanded,
      suppressProjectClickAfterDragRef,
      suppressProjectClickForContextMenuRef,
    ],
  );

  const handleProjectButtonKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      if (dragInProgressRef.current) {
        return;
      }
      setProjectExpanded(projectPreferenceKeys, !projectExpanded);
    },
    [dragInProgressRef, projectExpanded, projectPreferenceKeys, setProjectExpanded],
  );

  const handleProjectButtonPointerDownCapture = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      suppressProjectClickForContextMenuRef.current = false;
      if (
        isContextMenuPointerDown({
          button: event.button,
          ctrlKey: event.ctrlKey,
          isMac: isMacPlatform(navigator.platform),
        })
      ) {
        event.stopPropagation();
      }

      suppressProjectClickAfterDragRef.current = false;
    },
    [suppressProjectClickAfterDragRef, suppressProjectClickForContextMenuRef],
  );

  const openProjectRenameDialog = useCallback((member: SidebarProjectGroupMember) => {
    setProjectRenameTarget(member);
    setProjectRenameTitle(member.title);
  }, []);

  const openProjectGroupingDialog = useCallback(
    (member: SidebarProjectGroupMember) => {
      const overrideKey = deriveProjectGroupingOverrideKey(member);
      setProjectGroupingTarget(member);
      setProjectGroupingSelection(
        projectGroupingSettings.sidebarProjectGroupingOverrides?.[overrideKey] ?? "inherit",
      );
    },
    [projectGroupingSettings.sidebarProjectGroupingOverrides],
  );

  const removeProject = useCallback(
    async (member: SidebarProjectGroupMember, options: { force?: boolean } = {}) => {
      const memberProjectRef = scopeProjectRef(member.environmentId, member.id);
      const result = await deleteProject({
        environmentId: member.environmentId,
        input: {
          projectId: member.id,
          ...(options.force === true ? { force: true } : {}),
        },
      });
      if (result._tag === "Failure") {
        return result;
      }
      const draftStore = useComposerDraftStore.getState();
      const projectDraftThread = draftStore.getDraftThreadByProjectRef(memberProjectRef);
      if (projectDraftThread) {
        draftStore.clearDraftThread(projectDraftThread.draftId);
      }
      draftStore.clearProjectDraftThreadId(memberProjectRef);
      return result;
    },
    [deleteProject],
  );

  const handleRemoveProject = useCallback(
    async (member: SidebarProjectGroupMember) => {
      const api = readLocalApi();
      if (!api) {
        return;
      }

      const memberProjectRef = scopeProjectRef(member.environmentId, member.id);
      const memberThreadCount = memberThreadCountByPhysicalKey.get(member.physicalProjectKey) ?? 0;
      if (memberThreadCount > 0) {
        const warningToastId = toastManager.add(
          stackedThreadToast({
            type: "warning",
            title: "Project is not empty",
            description: "Delete all threads in this project before removing it.",
            actionVariant: "destructive",
            actionProps: {
              children: "Delete anyway",
              onClick: () => {
                void (async () => {
                  toastManager.close(warningToastId);
                  await new Promise<void>((resolve) => {
                    window.setTimeout(resolve, 180);
                  });

                  const latestProjectThreads = Array.from(
                    sidebarThreadByKeyRef.current.values(),
                  ).filter(
                    (thread) =>
                      thread.environmentId === memberProjectRef.environmentId &&
                      thread.projectId === memberProjectRef.projectId,
                  );
                  const confirmed = await api.dialogs.confirm(
                    latestProjectThreads.length > 0
                      ? [
                          `Remove project "${member.title}" and delete its ${latestProjectThreads.length} thread${
                            latestProjectThreads.length === 1 ? "" : "s"
                          }?`,
                          `Path: ${member.workspaceRoot}`,
                          ...(member.environmentLabel
                            ? [`Environment: ${member.environmentLabel}`]
                            : []),
                          "This permanently clears conversation history for those threads.",
                          "This removes only this project entry.",
                          "This action cannot be undone.",
                        ].join("\n")
                      : [
                          `Remove project "${member.title}"?`,
                          `Path: ${member.workspaceRoot}`,
                          ...(member.environmentLabel
                            ? [`Environment: ${member.environmentLabel}`]
                            : []),
                          "This removes only this project entry.",
                        ].join("\n"),
                  );
                  if (!confirmed) {
                    return;
                  }

                  const result = await removeProject(member, { force: true });
                  if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
                    const error = squashAtomCommandFailure(result);
                    toastManager.add(
                      stackedThreadToast({
                        type: "error",
                        title: `Failed to remove "${member.title}"`,
                        description:
                          error instanceof Error
                            ? error.message
                            : "Unknown error removing project.",
                      }),
                    );
                  }
                })().catch((error) => {
                  const message =
                    error instanceof Error ? error.message : "Unknown error removing project.";
                  console.error("Failed to remove project", {
                    projectId: member.id,
                    environmentId: member.environmentId,
                    ...safeErrorLogAttributes(error),
                  });
                  toastManager.add(
                    stackedThreadToast({
                      type: "error",
                      title: `Failed to remove "${member.title}"`,
                      description: message,
                    }),
                  );
                });
              },
            },
          }),
        );
        return;
      }

      const message = [
        `Remove project "${member.title}"?`,
        `Path: ${member.workspaceRoot}`,
        ...(member.environmentLabel ? [`Environment: ${member.environmentLabel}`] : []),
        "This removes only this project entry.",
      ].join("\n");
      const confirmed = await api.dialogs.confirm(message);
      if (!confirmed) {
        return;
      }

      const result = await removeProject(member);
      if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
        const error = squashAtomCommandFailure(result);
        const message = error instanceof Error ? error.message : "Unknown error removing project.";
        console.error("Failed to remove project", {
          projectId: member.id,
          environmentId: member.environmentId,
          ...safeErrorLogAttributes(error),
        });
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: `Failed to remove "${member.title}"`,
            description: message,
          }),
        );
      }
    },
    [memberThreadCountByPhysicalKey, removeProject],
  );

  const openProjectContextMenu = useCallback(
    (position: { readonly x: number; readonly y: number }) => {
      // dnd-kit activates its drag at 6px, tighter than the long-press slop, so
      // a small drag can start a reorder while the hold timer is still armed.
      if (dragInProgressRef.current) return;
      suppressProjectClickForContextMenuRef.current = true;
      void (async () => {
        const api = readLocalApi();
        if (!api) return;

        const actionHandlers = new Map<string, () => Promise<void> | void>();
        const makeLeaf = (
          action: "rename" | "grouping" | "copy-path" | "delete",
          member: SidebarProjectGroupMember,
          options?: {
            destructive?: boolean;
            disabled?: boolean;
          },
        ): ContextMenuItem<string> => {
          const id = `${action}:${member.physicalProjectKey}`;
          actionHandlers.set(id, () => {
            switch (action) {
              case "rename":
                openProjectRenameDialog(member);
                return;
              case "grouping":
                openProjectGroupingDialog(member);
                return;
              case "copy-path":
                copyPathToClipboard(member.workspaceRoot, { path: member.workspaceRoot });
                return;
              case "delete":
                return handleRemoveProject(member);
            }
          });

          return {
            id,
            label: formatProjectMemberActionLabel(member, project.groupedProjectCount),
            ...(options?.destructive ? { destructive: true } : {}),
            ...(options?.disabled ? { disabled: true } : {}),
          };
        };

        const buildTargetedItem = (
          action: "rename" | "grouping" | "copy-path" | "delete",
          label: string,
          options?: {
            destructive?: boolean;
            isDisabled?: (member: SidebarProjectGroupMember) => boolean;
          },
        ): ContextMenuItem<string> => {
          if (project.memberProjects.length === 1) {
            const singleMember = project.memberProjects[0]!;
            return {
              ...makeLeaf(action, singleMember, {
                ...(options?.destructive ? { destructive: true } : {}),
                ...(options?.isDisabled?.(singleMember) ? { disabled: true } : {}),
              }),
              label,
              ...(action === "delete" ? { icon: "trash" } : {}),
            };
          }

          return {
            id: `${action}:submenu`,
            label,
            ...(action === "delete" ? { icon: "trash" } : {}),
            children: project.memberProjects.map((member) =>
              makeLeaf(action, member, {
                ...(options?.destructive ? { destructive: true } : {}),
                ...(options?.isDisabled?.(member) ? { disabled: true } : {}),
              }),
            ),
          };
        };

        actionHandlers.set("toggle-hidden", () => {
          updateSettings({
            sidebarHiddenProjectKeys: toggleHiddenProjectKey(hiddenProjectKeys, project.projectKey),
          });
        });

        // A project can sit in several groups at once, so every group gets its
        // own toggle rather than a single-choice radio list. The native menu
        // has no checkbox items, so membership shows in the label.
        actionHandlers.set("project-group:new", () => {
          setNewProjectGroupName("");
          setIsNewProjectGroupDialogOpen(true);
        });
        for (const group of projectGroups) {
          actionHandlers.set(`project-group:${group.id}`, () => {
            updateSettings({
              sidebarProjectGroups: toggleProjectInGroup(
                projectGroups,
                group.id,
                project.projectKey,
              ),
            });
          });
        }
        const projectGroupItem: ContextMenuItem<string> = {
          id: "project-group:submenu",
          label: "Groups",
          children: [
            ...projectGroups.map((group): ContextMenuItem<string> => {
              const isMember = group.projectKeys.includes(project.projectKey);
              return {
                id: `project-group:${group.id}`,
                label: isMember ? `✓ ${group.name}` : group.name,
              };
            }),
            { id: "project-group:new", label: "New group..." },
          ],
        };

        const clicked = await api.contextMenu.show(
          [
            buildTargetedItem("rename", "Rename"),
            buildTargetedItem("grouping", "Group into..."),
            projectGroupItem,
            buildTargetedItem("copy-path", "Copy Path"),
            {
              id: "toggle-hidden",
              label: isProjectHidden ? "Show in sidebar" : "Hide from sidebar",
            },
            buildTargetedItem("delete", "Remove", {
              destructive: true,
            }),
          ],
          {
            x: position.x,
            y: position.y,
          },
        );

        if (!clicked) {
          return;
        }

        await actionHandlers.get(clicked)?.();
      })();
    },
    [
      copyPathToClipboard,
      dragInProgressRef,
      handleRemoveProject,
      hiddenProjectKeys,
      isProjectHidden,
      openProjectGroupingDialog,
      openProjectRenameDialog,
      project.groupedProjectCount,
      project.memberProjects,
      project.projectKey,
      projectGroups,
      suppressProjectClickForContextMenuRef,
      updateSettings,
    ],
  );

  const closeNewProjectGroupDialog = useCallback(() => {
    setIsNewProjectGroupDialogOpen(false);
    setNewProjectGroupName("");
  }, []);

  // Creating a group from a project row seeds it with that project, which is
  // the only reason the user opened this dialog.
  const submitNewProjectGroup = useCallback(() => {
    const trimmed = newProjectGroupName.trim();
    if (trimmed.length === 0) {
      toastManager.add({ type: "warning", title: "Group name cannot be empty" });
      return;
    }
    if (!isValidProjectGroupName(projectGroups, trimmed)) {
      toastManager.add({ type: "warning", title: `A group named "${trimmed}" already exists` });
      return;
    }
    updateSettings({
      sidebarProjectGroups: createProjectGroup(projectGroups, {
        id: randomUUID(),
        name: trimmed,
        projectKeys: [project.projectKey],
      }),
    });
    closeNewProjectGroupDialog();
  }, [
    closeNewProjectGroupDialog,
    newProjectGroupName,
    project.projectKey,
    projectGroups,
    updateSettings,
  ]);

  const handleProjectButtonContextMenu = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      openProjectContextMenu({ x: event.clientX, y: event.clientY });
    },
    [openProjectContextMenu],
  );
  const projectLongPress = useLongPressContextMenu(openProjectContextMenu);
  // dnd-kit's PointerSensor activator IS `onPointerDown`, and it is spread onto
  // this button as a plain JSX prop rather than merged. Spreading the long-press
  // bag would silently replace it and kill manual project reordering, so the
  // press is fed in through the capture phase instead.
  const handleProjectButtonPointerDownWithLongPress = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      handleProjectButtonPointerDownCapture(event);
      projectLongPress.onPointerDown(event);
    },
    [handleProjectButtonPointerDownCapture, projectLongPress],
  );

  const navigateToThread = useCallback(
    (threadRef: ScopedThreadRef) => {
      if (useThreadSelectionStore.getState().selectedThreadKeys.size > 0) {
        clearSelection();
      }
      setSelectionAnchor(scopedThreadKey(threadRef));
      if (isMobile) {
        setOpenMobile(false);
      }
      void router.navigate({
        to: "/$environmentId/$threadId",
        params: buildThreadRouteParams(threadRef),
      });
    },
    [clearSelection, isMobile, router, setOpenMobile, setSelectionAnchor],
  );

  const handleThreadClick = useCallback(
    (
      event: React.MouseEvent,
      threadRef: ScopedThreadRef,
      orderedProjectThreadKeys: readonly string[],
    ) => {
      const isMac = isMacPlatform(navigator.platform);
      const isModClick = isMac ? event.metaKey : event.ctrlKey;
      const isShiftClick = event.shiftKey;
      const threadKey = scopedThreadKey(threadRef);
      const currentSelectionCount = useThreadSelectionStore.getState().selectedThreadKeys.size;

      if (isModClick) {
        event.preventDefault();
        toggleThreadSelection(threadKey);
        return;
      }

      if (isShiftClick) {
        event.preventDefault();
        rangeSelectTo(threadKey, orderedProjectThreadKeys);
        return;
      }

      // Ignore the trailing click of a plain double-click so it doesn't navigate
      // while a double-click is starting an inline rename. Placed after the
      // modifier branches so cmd/shift selection still processes every click.
      if (isTrailingDoubleClick(event.detail)) {
        return;
      }

      if (currentSelectionCount > 0) {
        clearSelection();
      }
      setSelectionAnchor(threadKey);
      if (isMobile) {
        setOpenMobile(false);
      }
      void router.navigate({
        to: "/$environmentId/$threadId",
        params: buildThreadRouteParams(threadRef),
      });
    },
    [
      clearSelection,
      isMobile,
      rangeSelectTo,
      router,
      setOpenMobile,
      setSelectionAnchor,
      toggleThreadSelection,
    ],
  );

  const handleMultiSelectContextMenu = useCallback(
    async (position: { x: number; y: number }) => {
      const api = readLocalApi();
      if (!api) return;
      const threadKeys = [...useThreadSelectionStore.getState().selectedThreadKeys];
      if (threadKeys.length === 0) return;
      const count = threadKeys.length;
      const selectedThreadEntries = threadKeys.flatMap((threadKey) => {
        const threadRef = parseScopedThreadKey(threadKey);
        const thread = threadRef ? readThreadShell(threadRef) : null;
        return threadRef && thread ? [{ threadKey, threadRef, thread }] : [];
      });
      const hasRunningThread = selectedThreadEntries.some(
        ({ thread }) => !threadRuntimeCanArchive(thread.runtime),
      );

      const clicked = await api.contextMenu.show(
        buildMultiSelectThreadContextMenuItems({ count, hasRunningThread }),
        position,
      );

      if (clicked === "mark-unread") {
        for (const { threadRef } of selectedThreadEntries) {
          markThreadUnread(threadRef);
        }
        clearSelection();
        return;
      }

      if (clicked === "archive") {
        if (appSettingsConfirmThreadArchive) {
          const confirmed = await api.dialogs.confirm(
            `Archive ${count} thread${count === 1 ? "" : "s"}?`,
          );
          if (!confirmed) return;
        }

        const archiveOutcome = await archiveSelectedThreadEntries({
          entries: selectedThreadEntries,
          archive: ({ threadRef }, onArchived) => archiveThread(threadRef, { onArchived }),
        });
        for (const failure of archiveOutcome.followupFailures) {
          if (isAtomCommandInterrupted(failure)) continue;
          const error = squashAtomCommandFailure(failure);
          toastManager.add(
            stackedThreadToast({
              type: "error",
              title: "Thread archived, but navigation failed",
              description: error instanceof Error ? error.message : "An error occurred.",
            }),
          );
        }
        if (archiveOutcome.mutationFailure) {
          removeFromSelection(archiveOutcome.archivedThreadKeys);
          if (!isAtomCommandInterrupted(archiveOutcome.mutationFailure)) {
            const error = squashAtomCommandFailure(archiveOutcome.mutationFailure);
            toastManager.add(
              stackedThreadToast({
                type: "error",
                title: "Failed to archive threads",
                description: error instanceof Error ? error.message : "An error occurred.",
              }),
            );
          }
          return;
        }
        removeFromSelection(threadKeys);
        return;
      }

      if (clicked !== "delete") return;

      if (appSettingsConfirmThreadDelete) {
        const confirmed = await api.dialogs.confirm(
          [
            `Delete ${count} thread${count === 1 ? "" : "s"}?`,
            "This permanently clears conversation history for these threads.",
          ].join("\n"),
        );
        if (!confirmed) return;
      }

      const deletedThreadKeys = new Set(threadKeys);
      for (const { threadRef } of selectedThreadEntries) {
        const result = await deleteThread(threadRef, {
          deletedThreadKeys,
        });
        if (result._tag === "Failure") {
          if (!isAtomCommandInterrupted(result)) {
            const error = squashAtomCommandFailure(result);
            toastManager.add(
              stackedThreadToast({
                type: "error",
                title: "Failed to delete threads",
                description: error instanceof Error ? error.message : "An error occurred.",
              }),
            );
          }
          return;
        }
      }
      removeFromSelection(threadKeys);
    },
    [
      appSettingsConfirmThreadArchive,
      appSettingsConfirmThreadDelete,
      archiveThread,
      clearSelection,
      deleteThread,
      markThreadUnread,
      removeFromSelection,
    ],
  );

  const createThreadForProjectMember = useCallback(
    (member: SidebarProjectGroupMember) => {
      if (isMobile) {
        setOpenMobile(false);
      }
      void (async () => {
        // No options: branch, worktree, and env mode come from the user's
        // configured defaults, never from the currently viewed thread.
        const result = await settlePromise(() =>
          handleNewThread(scopeProjectRef(member.environmentId, member.id)),
        );
        if (result._tag === "Failure") {
          const error = squashAtomCommandFailure(result);
          toastManager.add(
            stackedThreadToast({
              type: "error",
              title: "Could not create thread",
              description: error instanceof Error ? error.message : "An error occurred.",
            }),
          );
        }
      })();
    },
    [handleNewThread, isMobile, setOpenMobile],
  );

  const handleCreateThreadClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();

      if (project.memberProjects.length === 1) {
        createThreadForProjectMember(project.memberProjects[0]!);
        return;
      }

      void (async () => {
        const api = readLocalApi();
        if (!api) {
          return;
        }
        const clickedResult = await settlePromise(() =>
          api.contextMenu.show(
            project.memberProjects.map((member) => ({
              id: member.physicalProjectKey,
              label: formatProjectMemberActionLabel(member, project.groupedProjectCount),
            })),
            {
              x: event.clientX,
              y: event.clientY,
            },
          ),
        );
        if (clickedResult._tag === "Failure") {
          const error = squashAtomCommandFailure(clickedResult);
          toastManager.add(
            stackedThreadToast({
              type: "error",
              title: "Could not choose environment",
              description: error instanceof Error ? error.message : "An error occurred.",
            }),
          );
          return;
        }
        const clicked = clickedResult.value;
        if (!clicked) {
          return;
        }
        const targetMember = project.memberProjects.find(
          (member) => member.physicalProjectKey === clicked,
        );
        if (!targetMember) {
          return;
        }
        createThreadForProjectMember(targetMember);
      })();
    },
    [createThreadForProjectMember, project.groupedProjectCount, project.memberProjects],
  );

  const attemptArchiveThread = useCallback(
    async (threadRef: ScopedThreadRef) => {
      const result = await archiveThread(threadRef);
      if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
        const error = squashAtomCommandFailure(result);
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: "Failed to archive thread",
            description: error instanceof Error ? error.message : "An error occurred.",
          }),
        );
      }
    },
    [archiveThread],
  );

  const cancelRename = useCallback(() => {
    setRenamingThreadKey(null);
    renamingInputRef.current = null;
  }, []);

  const startThreadRename = useCallback((threadKey: string, title: string) => {
    setRenamingThreadKey(threadKey);
    setRenamingTitle(title);
    renamingCommittedRef.current = false;
  }, []);

  const commitRename = useCallback(
    async (threadRef: ScopedThreadRef, newTitle: string, originalTitle: string) => {
      const threadKey = scopedThreadKey(threadRef);
      const finishRename = () => {
        setRenamingThreadKey((current) => {
          if (current !== threadKey) return current;
          renamingInputRef.current = null;
          return null;
        });
      };

      const trimmed = newTitle.trim();
      if (trimmed.length === 0) {
        toastManager.add({
          type: "warning",
          title: "Thread title cannot be empty",
        });
        finishRename();
        return;
      }
      if (trimmed === originalTitle) {
        finishRename();
        return;
      }
      const result = await updateThreadMetadata({
        environmentId: threadRef.environmentId,
        input: {
          threadId: threadRef.threadId,
          title: trimmed,
        },
      });
      if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
        const error = squashAtomCommandFailure(result);
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: "Failed to rename thread",
            description: error instanceof Error ? error.message : "An error occurred.",
          }),
        );
      }
      finishRename();
    },
    [updateThreadMetadata],
  );

  const closeProjectRenameDialog = useCallback(() => {
    setProjectRenameTarget(null);
    setProjectRenameTitle("");
  }, []);

  const submitProjectRename = useCallback(async () => {
    if (!projectRenameTarget) {
      return;
    }

    const trimmed = projectRenameTitle.trim();
    if (trimmed.length === 0) {
      toastManager.add({
        type: "warning",
        title: "Project title cannot be empty",
      });
      return;
    }

    if (trimmed === projectRenameTarget.title) {
      closeProjectRenameDialog();
      return;
    }

    const result = await updateProject({
      environmentId: projectRenameTarget.environmentId,
      input: {
        projectId: projectRenameTarget.id,
        title: trimmed,
      },
    });
    if (result._tag === "Success") {
      closeProjectRenameDialog();
    } else if (!isAtomCommandInterrupted(result)) {
      const error = squashAtomCommandFailure(result);
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: "Failed to rename project",
          description: error instanceof Error ? error.message : "An error occurred.",
        }),
      );
    }
  }, [closeProjectRenameDialog, projectRenameTarget, projectRenameTitle, updateProject]);

  const closeProjectGroupingDialog = useCallback(() => {
    setProjectGroupingTarget(null);
    setProjectGroupingSelection("inherit");
  }, []);

  const saveProjectGroupingPreference = useCallback(() => {
    if (!projectGroupingTarget) {
      return;
    }

    const overrideKey = deriveProjectGroupingOverrideKey(projectGroupingTarget);
    const nextOverrides = {
      ...projectGroupingSettings.sidebarProjectGroupingOverrides,
    };
    if (projectGroupingSelection === "inherit") {
      delete nextOverrides[overrideKey];
    } else {
      nextOverrides[overrideKey] = projectGroupingSelection;
    }
    updateSettings({
      sidebarProjectGroupingOverrides: nextOverrides,
    });
    closeProjectGroupingDialog();
  }, [
    closeProjectGroupingDialog,
    projectGroupingSelection,
    projectGroupingSettings.sidebarProjectGroupingOverrides,
    projectGroupingTarget,
    updateSettings,
  ]);

  const handleThreadContextMenu = useCallback(
    async (threadRef: ScopedThreadRef, position: { x: number; y: number }) => {
      const api = readLocalApi();
      if (!api) return;
      const threadKey = scopedThreadKey(threadRef);
      const thread = sidebarThreadByKeyRef.current.get(threadKey) ?? null;
      if (!thread) return;
      const threadProject = memberProjectByScopedKey.get(
        scopedProjectKey(scopeProjectRef(thread.environmentId, thread.projectId)),
      );
      const threadWorkspacePath =
        thread.worktreePath ?? threadProject?.workspaceRoot ?? project.workspaceRoot ?? null;
      const clicked = await api.contextMenu.show(
        [
          ...(thread.branch
            ? [{ id: "new-thread-on-branch", label: `New thread on ${thread.branch}` }]
            : []),
          { id: "rename", label: "Rename thread" },
          { id: "mark-unread", label: "Mark unread" },
          { id: "copy-path", label: "Copy Path" },
          { id: "copy-thread-id", label: "Copy Thread ID" },
          { id: "delete", label: "Delete", destructive: true, icon: "trash" },
        ],
        position,
      );

      if (clicked === "new-thread-on-branch") {
        // Explicit branch carry-over: reuse the thread's worktree when it
        // has one, otherwise its branch on the local checkout.
        const result = await settlePromise(() =>
          handleNewThread(scopeProjectRef(thread.environmentId, thread.projectId), {
            branch: thread.branch,
            worktreePath: thread.worktreePath,
            envMode: thread.worktreePath ? "worktree" : "local",
            startFromOrigin: false,
          }),
        );
        if (result._tag === "Failure") {
          const error = squashAtomCommandFailure(result);
          toastManager.add(
            stackedThreadToast({
              type: "error",
              title: "Could not create thread",
              description: error instanceof Error ? error.message : "An error occurred.",
            }),
          );
        }
        return;
      }

      if (clicked === "rename") {
        startThreadRename(threadKey, thread.title);
        return;
      }

      if (clicked === "mark-unread") {
        markThreadUnread(threadRef);
        return;
      }
      if (clicked === "copy-path") {
        if (!threadWorkspacePath) {
          toastManager.add(
            stackedThreadToast({
              type: "error",
              title: "Path unavailable",
              description: "This thread does not have a workspace path to copy.",
            }),
          );
          return;
        }
        copyPathToClipboard(threadWorkspacePath, { path: threadWorkspacePath });
        return;
      }
      if (clicked === "copy-thread-id") {
        copyThreadIdToClipboard(thread.id, { threadId: thread.id });
        return;
      }
      if (clicked !== "delete") return;
      if (appSettingsConfirmThreadDelete) {
        const confirmed = await api.dialogs.confirm(
          [
            `Delete thread "${thread.title}"?`,
            "This permanently clears conversation history for this thread.",
          ].join("\n"),
        );
        if (!confirmed) {
          return;
        }
      }
      const result = await deleteThread(threadRef);
      if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
        const error = squashAtomCommandFailure(result);
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: "Failed to delete thread",
            description: error instanceof Error ? error.message : "An error occurred.",
          }),
        );
      }
    },
    [
      appSettingsConfirmThreadDelete,
      copyPathToClipboard,
      copyThreadIdToClipboard,
      deleteThread,
      handleNewThread,
      markThreadUnread,
      memberProjectByScopedKey,
      project.workspaceRoot,
      startThreadRename,
    ],
  );

  return (
    <>
      <div className="group/project-header relative">
        <SidebarMenuButton
          ref={isManualProjectSorting ? dragHandleProps?.setActivatorNodeRef : undefined}
          className={`group-hover/project-header:bg-sidebar-row-hover group-hover/project-header:text-sidebar-foreground max-sm:pr-14 ${
            // The "new thread" button is always visible, so the title always
            // reserves room for it — plus extra room when the environment
            // badge sits alongside it.
            project.environmentPresence === "remote-only" ? "pr-14" : "pr-8"
          } ${isManualProjectSorting ? "cursor-grab active:cursor-grabbing" : ""}`}
          {...(isManualProjectSorting && dragHandleProps ? dragHandleProps.attributes : {})}
          {...(isManualProjectSorting && dragHandleProps ? dragHandleProps.listeners : {})}
          style={LONG_PRESS_TARGET_STYLE}
          onPointerDownCapture={handleProjectButtonPointerDownWithLongPress}
          onPointerMove={projectLongPress.onPointerMove}
          onPointerUp={projectLongPress.onPointerUp}
          onPointerCancel={projectLongPress.onPointerCancel}
          onClick={handleProjectButtonClick}
          onKeyDown={handleProjectButtonKeyDown}
          onContextMenu={handleProjectButtonContextMenu}
        >
          {!projectExpanded && projectStatus ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <span
                    aria-label={projectStatus.label}
                    className={`-ml-0.5 relative inline-flex size-3.5 shrink-0 items-center justify-center ${projectStatus.colorClass}`}
                  />
                }
              >
                <span className="absolute inset-0 flex items-center justify-center transition-opacity duration-150 group-hover/project-header:opacity-0">
                  <span
                    className={`size-[9px] rounded-full ${projectStatus.dotClass} ${
                      projectStatus.pulse ? "animate-status-pulse" : ""
                    }`}
                  />
                </span>
                <ChevronRightIcon className="absolute inset-0 m-auto size-3.5 text-muted-foreground/70 opacity-0 transition-opacity duration-150 group-hover/project-header:opacity-100" />
              </TooltipTrigger>
              <TooltipPopup side="top">{projectStatus.label}</TooltipPopup>
            </Tooltip>
          ) : (
            <ChevronRightIcon
              className={`-ml-0.5 size-3.5 shrink-0 text-muted-foreground/70 transition-transform duration-150 ${
                projectExpanded ? "rotate-90" : ""
              }`}
            />
          )}
          <ProjectFavicon project={{ ...project, title: project.displayName }} />
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <span className="truncate text-sm font-medium text-sidebar-foreground/90">
              {project.displayName}
            </span>
            {project.groupedProjectCount > 1 ? (
              <span className="shrink-0 text-[10px] text-muted-foreground/60">
                {project.groupedProjectCount} projects
              </span>
            ) : null}
          </span>
        </SidebarMenuButton>
        {/* Environment badge – always visible, parked to the left of the
            always-on "new thread" button instead of crossfading with it. */}
        {project.environmentPresence === "remote-only" && (
          <Tooltip>
            <TooltipTrigger
              render={
                <span
                  aria-label={
                    project.allRemoteMembersAreDesktopLocal
                      ? "Local sandbox project"
                      : "Remote project"
                  }
                  className="pointer-events-none absolute top-1 right-7 inline-flex size-5 items-center justify-center rounded-md text-muted-foreground/60"
                />
              }
            >
              {project.allRemoteMembersAreDesktopLocal ? (
                <ContainerIcon className="size-3" />
              ) : (
                <CloudIcon className="size-3" />
              )}
            </TooltipTrigger>
            <TooltipPopup side="top">
              {project.allRemoteMembersAreDesktopLocal
                ? `Local sandbox: ${project.remoteEnvironmentLabels.join(", ")}`
                : `Remote environment: ${project.remoteEnvironmentLabels.join(", ")}`}
            </TooltipPopup>
          </Tooltip>
        )}
        <Tooltip>
          <TooltipTrigger
            render={
              <div className="pointer-events-auto absolute top-[calc(50%+1px)] right-0.5 -translate-y-1/2">
                <button
                  type="button"
                  aria-label={`Create new thread in ${project.displayName}`}
                  data-testid="new-thread-button"
                  className={SIDEBAR_ICON_ACTION_BUTTON_CLASS}
                  onClick={handleCreateThreadClick}
                >
                  <PlusIcon className="size-3.5" />
                </button>
              </div>
            }
          />
          <TooltipPopup side="top">
            {newThreadShortcutLabel ? `New thread (${newThreadShortcutLabel})` : "New thread"}
          </TooltipPopup>
        </Tooltip>
      </div>

      <SidebarProjectThreadList
        workspaces={projectWorkspaces}
        workspaceThreadByKey={sidebarThreadByKey}
        handleNewThread={handleNewThread}
        projectKey={project.projectKey}
        projectExpanded={projectExpanded}
        hasOverflowingThreads={hasOverflowingThreads}
        hiddenThreadStatus={hiddenThreadStatus}
        orderedProjectThreadKeys={orderedProjectThreadKeys}
        renderedThreads={renderedThreads}
        showEmptyThreadState={showEmptyThreadState}
        shouldShowThreadPanel={shouldShowThreadPanel}
        isThreadListExpanded={isThreadListExpanded}
        projectCwd={project.workspaceRoot}
        activeRouteThreadKey={activeRouteThreadKey}
        threadJumpLabelByKey={threadJumpLabelByKey}
        appSettingsConfirmThreadArchive={appSettingsConfirmThreadArchive}
        renamingThreadKey={renamingThreadKey}
        renamingTitle={renamingTitle}
        setRenamingTitle={setRenamingTitle}
        startThreadRename={startThreadRename}
        renamingInputRef={renamingInputRef}
        renamingCommittedRef={renamingCommittedRef}
        confirmingArchiveThreadKey={confirmingArchiveThreadKey}
        setConfirmingArchiveThreadKey={setConfirmingArchiveThreadKey}
        confirmArchiveButtonRefs={confirmArchiveButtonRefs}
        attachThreadListAutoAnimateRef={attachThreadListAutoAnimateRef}
        handleThreadClick={handleThreadClick}
        navigateToThread={navigateToThread}
        handleMultiSelectContextMenu={handleMultiSelectContextMenu}
        handleThreadContextMenu={handleThreadContextMenu}
        clearSelection={clearSelection}
        commitRename={commitRename}
        cancelRename={cancelRename}
        attemptArchiveThread={attemptArchiveThread}
        openPrLink={openPrLink}
        expandThreadListForProject={expandThreadListForProject}
        collapseThreadListForProject={collapseThreadListForProject}
      />

      <Dialog
        open={projectRenameTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            closeProjectRenameDialog();
          }
        }}
      >
        <DialogPopup className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Rename project</DialogTitle>
            <DialogDescription>
              {projectRenameTarget
                ? `Update the title for ${projectRenameTarget.workspaceRoot}.`
                : "Update the project title."}
            </DialogDescription>
          </DialogHeader>
          <DialogPanel className="space-y-4">
            <div className="grid gap-1.5">
              <span className="text-xs font-medium text-foreground">Project title</span>
              <Input
                aria-label="Project title"
                value={projectRenameTitle}
                onChange={(event) => setProjectRenameTitle(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void submitProjectRename();
                  }
                }}
              />
            </div>
            {projectRenameTarget?.environmentLabel ? (
              <p className="text-xs text-muted-foreground">
                Environment: {projectRenameTarget.environmentLabel}
              </p>
            ) : null}
          </DialogPanel>
          <DialogFooter>
            <Button variant="outline" onClick={closeProjectRenameDialog}>
              Cancel
            </Button>
            <Button onClick={() => void submitProjectRename()}>Save</Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>

      <Dialog
        open={isNewProjectGroupDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            closeNewProjectGroupDialog();
          }
        }}
      >
        <DialogPopup className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New group</DialogTitle>
            <DialogDescription>
              {`Create a group and add ${project.displayName} to it. A project can belong to several groups.`}
            </DialogDescription>
          </DialogHeader>
          <DialogPanel className="space-y-4">
            <div className="grid gap-1.5">
              <span className="text-xs font-medium text-foreground">Group name</span>
              <Input
                autoFocus
                aria-label="Group name"
                value={newProjectGroupName}
                onChange={(event) => setNewProjectGroupName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    submitNewProjectGroup();
                  }
                }}
              />
            </div>
          </DialogPanel>
          <DialogFooter>
            <Button variant="outline" onClick={closeNewProjectGroupDialog}>
              Cancel
            </Button>
            <Button onClick={submitNewProjectGroup}>Create</Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>

      <Dialog
        open={projectGroupingTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            closeProjectGroupingDialog();
          }
        }}
      >
        <DialogPopup className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Project grouping</DialogTitle>
            <DialogDescription>
              {projectGroupingTarget
                ? `Choose how ${projectGroupingTarget.workspaceRoot} should be grouped in the sidebar.`
                : "Choose how this project should be grouped in the sidebar."}
            </DialogDescription>
          </DialogHeader>
          <DialogPanel className="space-y-4">
            <div className="grid gap-1.5">
              <span className="text-xs font-medium text-foreground">Grouping rule</span>
              <Select
                value={projectGroupingSelection}
                onValueChange={(value) => {
                  if (
                    value === "inherit" ||
                    value === "repository" ||
                    value === "repository_path" ||
                    value === "separate"
                  ) {
                    setProjectGroupingSelection(value);
                  }
                }}
              >
                <SelectTrigger className="w-full" aria-label="Project grouping rule">
                  <SelectValue>
                    {projectGroupingSelection === "inherit"
                      ? `Use global default (${PROJECT_GROUPING_MODE_LABELS[projectGroupingSettings.sidebarProjectGroupingMode]})`
                      : PROJECT_GROUPING_MODE_LABELS[projectGroupingSelection]}
                  </SelectValue>
                </SelectTrigger>
                <SelectPopup align="end" alignItemWithTrigger={false}>
                  <SelectItem hideIndicator value="inherit">
                    Use global default
                  </SelectItem>
                  <SelectItem hideIndicator value="repository">
                    {PROJECT_GROUPING_MODE_LABELS.repository}
                  </SelectItem>
                  <SelectItem hideIndicator value="repository_path">
                    {PROJECT_GROUPING_MODE_LABELS.repository_path}
                  </SelectItem>
                  <SelectItem hideIndicator value="separate">
                    {PROJECT_GROUPING_MODE_LABELS.separate}
                  </SelectItem>
                </SelectPopup>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">
              {projectGroupingSelection === "inherit"
                ? projectGroupingModeDescription(projectGroupingSettings.sidebarProjectGroupingMode)
                : projectGroupingModeDescription(projectGroupingSelection)}
            </p>
          </DialogPanel>
          <DialogFooter>
            <Button variant="outline" onClick={closeProjectGroupingDialog}>
              Cancel
            </Button>
            <Button onClick={saveProjectGroupingPreference}>Save</Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </>
  );
});

const SidebarProjectListRow = memo(function SidebarProjectListRow(props: SidebarProjectItemProps) {
  return (
    <SidebarMenuItem className="rounded-md">
      <SidebarProjectItem {...props} />
    </SidebarMenuItem>
  );
});

function LocalSecondaryStatus() {
  const { environments } = useEnvironments();
  // The desktop reports which local secondary backends (e.g. the WSL backend)
  // exist; the hook polls because the bridge has no change event. A backend that
  // is still cold-booting has no httpBaseUrl yet and isn't in the catalog, so we
  // surface "Connecting" straight from the bootstrap list and clear it once the
  // matching environment reports a connected phase.
  const secondaries = useDesktopLocalBootstraps();

  // Connected desktop-local environments keyed by their backend URL so we can
  // match a bootstrap (which only knows the URL) to its connection phase.
  const localEnvByUrl = useMemo(() => {
    const map = new Map<string, { phase: string; error: string | null }>();
    for (const environment of environments) {
      if (
        isDesktopLocalConnectionTarget(environment.entry.target) &&
        environment.displayUrl !== null
      ) {
        map.set(environment.displayUrl, {
          phase: environment.connection.phase,
          error: environment.connection.error,
        });
      }
    }
    return map;
  }, [environments]);

  const connecting: string[] = [];
  const failed: Array<{ label: string; error: string | null }> = [];
  for (const bootstrap of secondaries) {
    const env =
      bootstrap.httpBaseUrl !== null ? localEnvByUrl.get(bootstrap.httpBaseUrl) : undefined;
    if (env?.phase === "connected") {
      continue;
    }
    if (env?.phase === "error") {
      failed.push({ label: bootstrap.label, error: env.error });
      continue;
    }
    connecting.push(bootstrap.label);
  }

  if (connecting.length === 0 && failed.length === 0) {
    return null;
  }

  return (
    <SidebarGroup className="px-2 pt-2 pb-0">
      {connecting.length > 0 ? (
        <Alert
          variant="default"
          className="rounded-[var(--control-radius)] border-border/40 bg-accent/40 text-muted-foreground"
        >
          <LoaderIcon className="animate-spin" />
          <AlertTitle className="text-xs font-medium text-foreground">
            Connecting {connecting.join(", ")}
          </AlertTitle>
        </Alert>
      ) : null}
      {failed.length > 0 ? (
        <Alert
          variant="warning"
          className="rounded-[var(--control-radius)] border-warning/40 bg-warning/8"
        >
          <TriangleAlertIcon />
          <AlertTitle>Couldn't connect {failed.map((entry) => entry.label).join(", ")}</AlertTitle>
          <AlertDescription>
            {failed
              .map((entry) => entry.error)
              .filter(Boolean)
              .join("; ") || "The backend didn't respond."}
          </AlertDescription>
        </Alert>
      ) : null}
    </SidebarGroup>
  );
}

type SortableProjectHandleProps = Pick<
  ReturnType<typeof useSortable>,
  "attributes" | "listeners" | "setActivatorNodeRef"
>;

function ProjectSortMenu({
  projectSortOrder,
  onProjectSortOrderChange,
}: {
  projectSortOrder: SidebarProjectSortOrder;
  onProjectSortOrderChange: (sortOrder: SidebarProjectSortOrder) => void;
}) {
  return (
    <Menu>
      <Tooltip>
        <TooltipTrigger
          render={
            <MenuTrigger className="inline-flex h-6 min-w-6 cursor-pointer items-center justify-center rounded-md px-[calc(--spacing(1)-1px)] text-muted-foreground/60 transition-colors hover:bg-accent hover:text-foreground" />
          }
        >
          <ArrowUpDownIcon className="size-3.5" />
        </TooltipTrigger>
        <TooltipPopup side="right">Sidebar options</TooltipPopup>
      </Tooltip>
      <MenuPopup align="end" side="bottom" className="min-w-52">
        <MenuGroup>
          <div className="px-2 py-1 sm:text-xs font-medium text-muted-foreground">
            Sort projects
          </div>
          <MenuRadioGroup
            value={projectSortOrder}
            onValueChange={(value) => {
              onProjectSortOrderChange(value as SidebarProjectSortOrder);
            }}
          >
            {(Object.entries(SIDEBAR_SORT_LABELS) as Array<[SidebarProjectSortOrder, string]>).map(
              ([value, label]) => (
                <MenuRadioItem key={value} value={value} className="min-h-7 py-1 sm:text-xs">
                  {label}
                </MenuRadioItem>
              ),
            )}
          </MenuRadioGroup>
        </MenuGroup>
      </MenuPopup>
    </Menu>
  );
}

function SortableProjectItem({
  projectId,
  disabled = false,
  children,
}: {
  projectId: string;
  disabled?: boolean;
  children: (handleProps: SortableProjectHandleProps) => React.ReactNode;
}) {
  const {
    attributes,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
    isDragging,
    isOver,
  } = useSortable({ id: projectId, disabled });
  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
      }}
      className={`group/menu-item relative rounded-md ${
        isDragging ? "z-20 opacity-80" : ""
      } ${isOver && !isDragging ? "ring-1 ring-primary/40" : ""}`}
      data-sidebar="menu-item"
      data-slot="sidebar-menu-item"
    >
      {children({ attributes, listeners, setActivatorNodeRef })}
    </li>
  );
}

interface SidebarProjectsContentProps {
  showArm64IntelBuildWarning: boolean;
  arm64IntelBuildWarningDescription: string | null;
  desktopUpdateButtonAction: "download" | "install" | "none";
  desktopUpdateButtonDisabled: boolean;
  handleDesktopUpdateButtonClick: () => void;
  projectSortOrder: SidebarProjectSortOrder;
  updateSettings: ReturnType<typeof useUpdateClientSettings>;
  openAddProject: () => void;
  isManualProjectSorting: boolean;
  projectDnDSensors: ReturnType<typeof useSensors>;
  projectCollisionDetection: CollisionDetection;
  handleProjectDragStart: (event: DragStartEvent) => void;
  handleProjectDragEnd: (event: DragEndEvent) => void;
  handleProjectDragCancel: (event: DragCancelEvent) => void;
  handleNewThread: ReturnType<typeof useNewThreadHandler>;
  archiveThread: ReturnType<typeof useThreadActions>["archiveThread"];
  deleteThread: ReturnType<typeof useThreadActions>["deleteThread"];
  sortedProjects: readonly SidebarProjectSnapshot[];
  workspacesByProjectKey: ReadonlyMap<string, readonly ProjectWorkspace[]>;
  pinnedWorkspaces: readonly ProjectWorkspace[];
  archivedWorkspaces: readonly ProjectWorkspace[];
  workspaceThreadByKey: ReadonlyMap<string, SidebarThreadSummary>;
  hiddenProjectCount: number;
  showHiddenProjects: boolean;
  onToggleShowHiddenProjects: () => void;
  expandedThreadListsByProject: ReadonlySet<string>;
  routeThreadKey: string | null;
  newThreadShortcutLabel: string | null;
  commandPaletteShortcutLabel: string | null;
  threadJumpLabelByKey: ReadonlyMap<string, string>;
  attachThreadListAutoAnimateRef: (node: HTMLElement | null) => void;
  expandThreadListForProject: (projectKey: string) => void;
  collapseThreadListForProject: (projectKey: string) => void;
  areAllProjectsExpanded: boolean;
  onToggleAllProjectsExpanded: () => void;
  dragInProgressRef: React.RefObject<boolean>;
  suppressProjectClickAfterDragRef: React.RefObject<boolean>;
  suppressProjectClickForContextMenuRef: React.RefObject<boolean>;
  attachProjectListAutoAnimateRef: (node: HTMLElement | null) => void;
  projectsLength: number;
  projectGroupStatusById: ReadonlyMap<string, ThreadAttentionStatus>;
}

const SidebarProjectsContent = memo(function SidebarProjectsContent(
  props: SidebarProjectsContentProps,
) {
  const {
    showArm64IntelBuildWarning,
    arm64IntelBuildWarningDescription,
    desktopUpdateButtonAction,
    desktopUpdateButtonDisabled,
    handleDesktopUpdateButtonClick,
    projectSortOrder,
    updateSettings,
    openAddProject,
    isManualProjectSorting,
    projectDnDSensors,
    projectCollisionDetection,
    handleProjectDragStart,
    handleProjectDragEnd,
    handleProjectDragCancel,
    handleNewThread,
    archiveThread,
    deleteThread,
    sortedProjects,
    workspacesByProjectKey,
    pinnedWorkspaces,
    archivedWorkspaces,
    workspaceThreadByKey,
    hiddenProjectCount,
    showHiddenProjects,
    onToggleShowHiddenProjects,
    expandedThreadListsByProject,
    routeThreadKey,
    newThreadShortcutLabel,
    commandPaletteShortcutLabel,
    threadJumpLabelByKey,
    attachThreadListAutoAnimateRef,
    expandThreadListForProject,
    collapseThreadListForProject,
    areAllProjectsExpanded,
    onToggleAllProjectsExpanded,
    dragInProgressRef,
    suppressProjectClickAfterDragRef,
    suppressProjectClickForContextMenuRef,
    attachProjectListAutoAnimateRef,
    projectsLength,
    projectGroupStatusById,
  } = props;
  const [showArchivedWorkspaces, setShowArchivedWorkspaces] = useState(false);

  const handleProjectSortOrderChange = useCallback(
    (sortOrder: SidebarProjectSortOrder) => {
      updateSettings({ sidebarProjectSortOrder: sortOrder });
    },
    [updateSettings],
  );

  // Rows are found by selector rather than by ref, so project headers, branch
  // rows and thread rows all share one pill without threading refs through the
  // drag-and-drop wiring.
  const treeHighlight = useDelegatedGlidingHighlight('[data-sidebar="menu-button"]');

  return (
    <SidebarContent
      // The travelling pill replaces each row's own hover fill, so hover
      // backgrounds are neutralised here. Selected and active rows keep theirs.
      className="relative gap-0 [&_[data-sidebar=menu-button]:hover]:bg-transparent [&_[data-sidebar=menu-button]]:group-hover/project-header:bg-transparent"
      {...treeHighlight.containerProps}
      fixedHeader={
        <SidebarGroup className="px-2 pt-2 pb-1">
          <SidebarMenu>
            <SidebarMenuItem>
              <CommandDialogTrigger
                render={
                  <SidebarMenuButton
                    className="focus-visible:ring-0"
                    data-testid="command-palette-trigger"
                  />
                }
              >
                <SearchIcon />
                <span className="flex-1 truncate">Search</span>
                {commandPaletteShortcutLabel ? (
                  <Kbd className="h-4 min-w-0 rounded-sm px-1.5 text-[10px]">
                    {commandPaletteShortcutLabel}
                  </Kbd>
                ) : null}
              </CommandDialogTrigger>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      }
    >
      <GlidingHighlight box={treeHighlight.box} className="bg-sidebar-row-hover" />
      {showArm64IntelBuildWarning && arm64IntelBuildWarningDescription ? (
        <SidebarGroup className="px-2 pt-2 pb-0">
          <Alert
            variant="warning"
            className="rounded-[var(--control-radius)] border-warning/40 bg-warning/8"
          >
            <TriangleAlertIcon />
            <AlertTitle>Intel build on Apple Silicon</AlertTitle>
            <AlertDescription>{arm64IntelBuildWarningDescription}</AlertDescription>
            {desktopUpdateButtonAction !== "none" ? (
              <AlertAction>
                <Button
                  size="xs"
                  variant="outline"
                  disabled={desktopUpdateButtonDisabled}
                  onClick={handleDesktopUpdateButtonClick}
                >
                  {desktopUpdateButtonAction === "download"
                    ? "Download ARM build"
                    : "Install ARM build"}
                </Button>
              </AlertAction>
            ) : null}
          </Alert>
        </SidebarGroup>
      ) : null}
      <LocalSecondaryStatus />
      {pinnedWorkspaces.length > 0 ? (
        <SidebarGroup className="px-2 pt-2 pb-0">
          <div className="mb-1 px-2 text-xs font-medium text-sidebar-muted-foreground/80">
            Pinned
          </div>
          <SidebarWorkspaceList
            workspaces={pinnedWorkspaces}
            workspaceThreadByKey={workspaceThreadByKey}
            handleNewThread={handleNewThread}
            showProjectIcon
          />
        </SidebarGroup>
      ) : null}
      <SidebarGroup className="px-2 py-2">
        <div className="mb-1 flex items-center justify-between pl-2 pr-1.5">
          <SidebarProjectGroupFilter statusByGroupId={projectGroupStatusById} />
          <div className="flex items-center gap-1">
            {sortedProjects.length > 0 ? (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button
                      type="button"
                      aria-label={
                        areAllProjectsExpanded ? "Collapse all projects" : "Expand all projects"
                      }
                      aria-pressed={areAllProjectsExpanded}
                      data-testid="sidebar-toggle-all-projects"
                      className="inline-flex h-6 min-w-6 cursor-pointer items-center justify-center rounded-md px-[calc(--spacing(1)-1px)] text-muted-foreground/60 transition-colors hover:bg-accent hover:text-foreground"
                      onClick={onToggleAllProjectsExpanded}
                    />
                  }
                >
                  {areAllProjectsExpanded ? (
                    <ChevronsDownUpIcon className="size-3.5" />
                  ) : (
                    <ChevronsUpDownIcon className="size-3.5" />
                  )}
                </TooltipTrigger>
                <TooltipPopup side="right">
                  {areAllProjectsExpanded ? "Collapse all projects" : "Expand all projects"}
                </TooltipPopup>
              </Tooltip>
            ) : null}
            <ProjectSortMenu
              projectSortOrder={projectSortOrder}
              onProjectSortOrderChange={handleProjectSortOrderChange}
            />
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    aria-label="Add project"
                    data-testid="sidebar-add-project-trigger"
                    className="inline-flex h-6 min-w-6 cursor-pointer items-center justify-center rounded-md px-[calc(--spacing(1)-1px)] text-muted-foreground/60 transition-colors hover:bg-accent hover:text-foreground"
                    onClick={openAddProject}
                  />
                }
              >
                <FolderPlusIcon className="size-3.5" />
              </TooltipTrigger>
              <TooltipPopup side="right">Add project</TooltipPopup>
            </Tooltip>
          </div>
        </div>

        {isManualProjectSorting ? (
          <DndContext
            sensors={projectDnDSensors}
            collisionDetection={projectCollisionDetection}
            modifiers={[restrictToVerticalAxis, restrictToFirstScrollableAncestor]}
            onDragStart={handleProjectDragStart}
            onDragEnd={handleProjectDragEnd}
            onDragCancel={handleProjectDragCancel}
          >
            <SidebarMenu>
              <SortableContext
                items={sortedProjects.map((project) => project.projectKey)}
                strategy={verticalListSortingStrategy}
              >
                {sortedProjects.map((project) => (
                  <SortableProjectItem key={project.projectKey} projectId={project.projectKey}>
                    {(dragHandleProps) => (
                      <SidebarProjectItem
                        project={project}
                        projectWorkspaces={workspacesByProjectKey.get(project.projectKey) ?? []}
                        isThreadListExpanded={expandedThreadListsByProject.has(project.projectKey)}
                        activeRouteThreadKey={routeThreadKey}
                        newThreadShortcutLabel={newThreadShortcutLabel}
                        handleNewThread={handleNewThread}
                        archiveThread={archiveThread}
                        deleteThread={deleteThread}
                        threadJumpLabelByKey={threadJumpLabelByKey}
                        attachThreadListAutoAnimateRef={attachThreadListAutoAnimateRef}
                        expandThreadListForProject={expandThreadListForProject}
                        collapseThreadListForProject={collapseThreadListForProject}
                        dragInProgressRef={dragInProgressRef}
                        suppressProjectClickAfterDragRef={suppressProjectClickAfterDragRef}
                        suppressProjectClickForContextMenuRef={
                          suppressProjectClickForContextMenuRef
                        }
                        isManualProjectSorting={isManualProjectSorting}
                        dragHandleProps={dragHandleProps}
                      />
                    )}
                  </SortableProjectItem>
                ))}
              </SortableContext>
            </SidebarMenu>
          </DndContext>
        ) : (
          <SidebarMenu ref={attachProjectListAutoAnimateRef}>
            {sortedProjects.map((project) => (
              <SidebarProjectListRow
                key={project.projectKey}
                project={project}
                projectWorkspaces={workspacesByProjectKey.get(project.projectKey) ?? []}
                isThreadListExpanded={expandedThreadListsByProject.has(project.projectKey)}
                activeRouteThreadKey={routeThreadKey}
                newThreadShortcutLabel={newThreadShortcutLabel}
                handleNewThread={handleNewThread}
                archiveThread={archiveThread}
                deleteThread={deleteThread}
                threadJumpLabelByKey={threadJumpLabelByKey}
                attachThreadListAutoAnimateRef={attachThreadListAutoAnimateRef}
                expandThreadListForProject={expandThreadListForProject}
                collapseThreadListForProject={collapseThreadListForProject}
                dragInProgressRef={dragInProgressRef}
                suppressProjectClickAfterDragRef={suppressProjectClickAfterDragRef}
                suppressProjectClickForContextMenuRef={suppressProjectClickForContextMenuRef}
                isManualProjectSorting={isManualProjectSorting}
                dragHandleProps={null}
              />
            ))}
          </SidebarMenu>
        )}

        {projectsLength === 0 && (
          <div className="px-2 pt-4 text-center text-xs text-muted-foreground/60">
            No projects yet
          </div>
        )}

        {/* An active group that matches nothing would otherwise render a blank
            gap with no hint that a filter is on. */}
        {projectsLength > 0 && sortedProjects.length === 0 && hiddenProjectCount === 0 ? (
          <div
            className="px-2 pt-4 text-center text-xs text-muted-foreground/60"
            data-testid="sidebar-empty-project-group"
          >
            No projects in this group
          </div>
        ) : null}

        {hiddenProjectCount > 0 ? (
          <button
            type="button"
            data-testid="sidebar-hidden-projects-toggle"
            aria-expanded={showHiddenProjects}
            onClick={onToggleShowHiddenProjects}
            className="mt-1 flex h-8 w-full cursor-pointer items-center gap-2 rounded-md px-2 text-left text-xs text-sidebar-muted-foreground/70 transition-colors hover:bg-sidebar-row-hover hover:text-sidebar-foreground"
          >
            {showHiddenProjects ? (
              <EyeOffIcon aria-hidden className="size-3.5 shrink-0" />
            ) : (
              <EyeIcon aria-hidden className="size-3.5 shrink-0" />
            )}
            <span className="truncate">
              {hiddenRepositoriesLabel(hiddenProjectCount, showHiddenProjects)}
            </span>
          </button>
        ) : null}

        {archivedWorkspaces.length > 0 ? (
          <div className="mt-1">
            <button
              type="button"
              data-testid="sidebar-archived-workspaces-toggle"
              aria-expanded={showArchivedWorkspaces}
              onClick={() => setShowArchivedWorkspaces((current) => !current)}
              className="flex h-8 w-full cursor-pointer items-center gap-2 rounded-md px-2 text-left text-xs text-sidebar-muted-foreground/70 transition-colors hover:bg-sidebar-row-hover hover:text-sidebar-foreground"
            >
              <ChevronRightIcon
                aria-hidden
                className={`size-3.5 shrink-0 transition-transform ${showArchivedWorkspaces ? "rotate-90" : ""}`}
              />
              <ArchiveIcon aria-hidden className="size-3.5 shrink-0" />
              <span className="truncate">Archived ({archivedWorkspaces.length})</span>
            </button>
            {showArchivedWorkspaces ? (
              <SidebarWorkspaceList
                workspaces={archivedWorkspaces}
                workspaceThreadByKey={workspaceThreadByKey}
                handleNewThread={handleNewThread}
                showProjectIcon
                showTabs={false}
              />
            ) : null}
          </div>
        ) : null}
      </SidebarGroup>
    </SidebarContent>
  );
});

export default function SidebarVoid() {
  const projects = useProjects();
  const allEnvironmentShellsBootstrapped = useAllEnvironmentShellsBootstrapped();
  const sidebarThreads = useThreadShells();
  const draftThreadsByThreadKey = useComposerDraftStore((state) => state.draftThreadsByThreadKey);
  const { pinnedWorkspaceKeys, archivedWorkspaceKeys } = useWorkspaceSidebarStore(
    useShallow((state) => ({
      pinnedWorkspaceKeys: state.pinnedWorkspaceKeys,
      archivedWorkspaceKeys: state.archivedWorkspaceKeys,
    })),
  );
  const projectExpandedById = useUiStateStore((store) => store.projectExpandedById);
  const projectOrder = useUiStateStore((store) => store.projectOrder);
  const reorderProjects = useUiStateStore((store) => store.reorderProjects);
  const setProjectExpandedInStore = useUiStateStore((store) => store.setProjectExpanded);
  const navigate = useNavigate();
  const pathname = useLocation({ select: (loc) => loc.pathname });
  const isOnSettings = pathname.startsWith("/settings");
  const sidebarThreadSortOrder = useClientSettings((s) => s.sidebarThreadSortOrder);
  const sidebarProjectSortOrder = useClientSettings((s) => s.sidebarProjectSortOrder);
  const projectGroupingSettings = useClientSettings(selectProjectGroupingSettings);
  const sidebarThreadPreviewCount = useClientSettings((s) => s.sidebarThreadPreviewCount);
  const hiddenProjectKeys = useClientSettings((s) => s.sidebarHiddenProjectKeys);
  const projectGroups = useClientSettings((s) => s.sidebarProjectGroups);
  const activeProjectGroupId = useClientSettings((s) => s.sidebarActiveProjectGroupId);
  const [showHiddenProjects, setShowHiddenProjects] = useState(false);
  const toggleShowHiddenProjects = useCallback(() => {
    setShowHiddenProjects((current) => !current);
  }, []);
  const updateSettings = useUpdateClientSettings();
  const handleNewThread = useNewThreadHandler();
  const { archiveThread, deleteThread } = useThreadActions();
  const { isMobile, setOpenMobile } = useSidebar();
  const routeTarget = useParams({
    strict: false,
    select: (params) => resolveThreadRouteTarget(params),
  });
  const routeDraftThread = useComposerDraftStore((store) =>
    routeTarget?.kind === "draft" ? store.getDraftSession(routeTarget.draftId) : null,
  );
  const routeThreadRef = useMemo(
    () => resolveActiveThreadRouteRef(routeTarget, routeDraftThread),
    [routeDraftThread, routeTarget],
  );
  const routeThreadKey = routeThreadRef ? scopedThreadKey(routeThreadRef) : null;
  // An unsent draft has no server thread yet, but it already holds a tab under
  // its reserved thread id, so the tab lists match on that.
  const routeTabKey =
    routeThreadKey ??
    (routeDraftThread
      ? scopedThreadKey(scopeThreadRef(routeDraftThread.environmentId, routeDraftThread.threadId))
      : null);
  const routeTerminalOpen = useTerminalUiStateStore((state) =>
    routeThreadRef
      ? selectThreadTerminalUiState(state.terminalUiStateByThreadKey, routeThreadRef).terminalOpen
      : false,
  );
  const keybindings = useAtomValue(primaryServerKeybindingsAtom);
  const openAddProjectCommandPalette = useCallback(
    () => openCommandPalette({ open: "add-project" }),
    [],
  );
  const [expandedThreadListsByProject, setExpandedThreadListsByProject] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const dragInProgressRef = useRef(false);
  const suppressProjectClickAfterDragRef = useRef(false);
  const suppressProjectClickForContextMenuRef = useRef(false);
  const desktopUpdateState = useDesktopUpdateState();
  const clearSelection = useThreadSelectionStore((s) => s.clearSelection);
  const setSelectionAnchor = useThreadSelectionStore((s) => s.setAnchor);
  const platform = navigator.platform;
  const shortcutModifiers = useShortcutModifierState();
  const { environments } = useEnvironments();
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const privateProjectName = usePrivateProjectName();
  const environmentLabelById = useMemo(
    () =>
      new Map(
        environments.map((environment) => [environment.environmentId, environment.label] as const),
      ),
    [environments],
  );
  const desktopLocalEnvironmentIds = useMemo(
    () =>
      new Set(
        environments
          .filter((environment) => isDesktopLocalConnectionTarget(environment.entry.target))
          .map((environment) => environment.environmentId),
      ),
    [environments],
  );
  const orderedProjects = useMemo(() => {
    return orderItemsByPreferredIds({
      items: projects,
      preferredIds: projectOrder,
      getId: getProjectOrderKey,
      getPreferenceIds: (project) => [
        getProjectOrderKey(project),
        legacyProjectCwdPreferenceKey(project.workspaceRoot),
      ],
    });
  }, [projectOrder, projects]);

  // Build a mapping from physical project key → logical project key for
  // cross-environment grouping.  Projects that share a repositoryIdentity
  // canonicalKey are treated as one logical project in the sidebar.
  const physicalToLogicalKey = useMemo(() => {
    return buildPhysicalToLogicalProjectKeyMap({
      projects: orderedProjects,
      settings: projectGroupingSettings,
      primaryEnvironmentId,
    });
  }, [orderedProjects, projectGroupingSettings, primaryEnvironmentId]);
  const projectPhysicalKeyByScopedRef = useMemo(
    () =>
      new Map(
        orderedProjects.map((project) => [
          scopedProjectKey(scopeProjectRef(project.environmentId, project.id)),
          derivePhysicalProjectKey(project),
        ]),
      ),
    [orderedProjects],
  );

  const sidebarProjects = useMemo<SidebarProjectSnapshot[]>(() => {
    return buildSidebarProjectSnapshots({
      projects: orderedProjects,
      settings: projectGroupingSettings,
      primaryEnvironmentId,
      resolveEnvironmentLabel: (environmentId) => environmentLabelById.get(environmentId) ?? null,
      isDesktopLocalEnvironment: (environmentId) => desktopLocalEnvironmentIds.has(environmentId),
      // Only the rendered label is swapped. Member titles keep the real name
      // so rename, remove, and grouping still act on the real project.
    }).map((project) => ({
      ...project,
      displayName: privateProjectName(project.displayName),
    }));
  }, [
    environmentLabelById,
    desktopLocalEnvironmentIds,
    orderedProjects,
    privateProjectName,
    projectGroupingSettings,
    primaryEnvironmentId,
  ]);

  const sidebarProjectByKey = useMemo(
    () => new Map(sidebarProjects.map((project) => [project.projectKey, project] as const)),
    [sidebarProjects],
  );
  const sidebarThreadByKey = useMemo(
    () =>
      new Map(
        sidebarThreads.map(
          (thread) =>
            [scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)), thread] as const,
        ),
      ),
    [sidebarThreads],
  );
  // Group threads by logical project key so all threads from grouped projects
  // are displayed together.
  const threadsByProjectKey = useMemo(() => {
    const next = new Map<string, SidebarThreadSummary[]>();
    for (const thread of sidebarThreads) {
      const physicalKey =
        projectPhysicalKeyByScopedRef.get(
          scopedProjectKey(scopeProjectRef(thread.environmentId, thread.projectId)),
        ) ?? scopedProjectKey(scopeProjectRef(thread.environmentId, thread.projectId));
      const logicalKey = physicalToLogicalKey.get(physicalKey) ?? physicalKey;
      const existing = next.get(logicalKey);
      if (existing) {
        existing.push(thread);
      } else {
        next.set(logicalKey, [thread]);
      }
    }
    return next;
  }, [sidebarThreads, physicalToLogicalKey, projectPhysicalKeyByScopedRef]);
  const getCurrentSidebarShortcutContext = useCallback(
    () => ({
      terminalFocus: isTerminalFocused(),
      terminalOpen: routeTerminalOpen,
      modelPickerOpen: isModelPickerOpen(),
    }),
    [routeTerminalOpen],
  );
  const newThreadShortcutLabelOptions = useMemo(
    () => ({
      platform,
      context: {
        terminalFocus: false,
        terminalOpen: false,
      },
    }),
    [platform],
  );
  const newThreadShortcutLabel =
    shortcutLabelForCommand(keybindings, "chat.newLocal", newThreadShortcutLabelOptions) ??
    shortcutLabelForCommand(keybindings, "chat.new", newThreadShortcutLabelOptions);

  const navigateToThread = useCallback(
    (threadRef: ScopedThreadRef) => {
      if (useThreadSelectionStore.getState().selectedThreadKeys.size > 0) {
        clearSelection();
      }
      setSelectionAnchor(scopedThreadKey(threadRef));
      if (isMobile) {
        setOpenMobile(false);
      }
      void navigate({
        to: "/$environmentId/$threadId",
        params: buildThreadRouteParams(threadRef),
      });
    },
    [clearSelection, isMobile, navigate, setOpenMobile, setSelectionAnchor],
  );

  const projectDnDSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
  );
  const projectCollisionDetection = useCallback<CollisionDetection>((args) => {
    const pointerCollisions = pointerWithin(args);
    if (pointerCollisions.length > 0) {
      return pointerCollisions;
    }

    return closestCorners(args);
  }, []);

  const handleProjectDragEnd = useCallback(
    (event: DragEndEvent) => {
      if (sidebarProjectSortOrder !== "manual") {
        dragInProgressRef.current = false;
        return;
      }
      dragInProgressRef.current = false;
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const activeProject = sidebarProjects.find((project) => project.projectKey === active.id);
      const overProject = sidebarProjects.find((project) => project.projectKey === over.id);
      if (!activeProject || !overProject) return;
      const activeMemberKeys = activeProject.memberProjects.map(
        (member) => member.physicalProjectKey,
      );
      const overMemberKeys = overProject.memberProjects.map((member) => member.physicalProjectKey);
      reorderProjects(orderedProjects.map(getProjectOrderKey), activeMemberKeys, overMemberKeys);
    },
    [orderedProjects, sidebarProjectSortOrder, reorderProjects, sidebarProjects],
  );

  const handleProjectDragStart = useCallback(
    (_event: DragStartEvent) => {
      if (sidebarProjectSortOrder !== "manual") {
        return;
      }
      dragInProgressRef.current = true;
      suppressProjectClickAfterDragRef.current = true;
    },
    [sidebarProjectSortOrder],
  );

  const handleProjectDragCancel = useCallback((_event: DragCancelEvent) => {
    dragInProgressRef.current = false;
  }, []);

  const animatedProjectListsRef = useRef(new WeakSet<HTMLElement>());
  const attachProjectListAutoAnimateRef = useCallback((node: HTMLElement | null) => {
    if (!node || animatedProjectListsRef.current.has(node)) {
      return;
    }
    autoAnimate(node, SIDEBAR_LIST_ANIMATION_OPTIONS);
    animatedProjectListsRef.current.add(node);
  }, []);

  const animatedThreadListsRef = useRef(new WeakSet<HTMLElement>());
  const attachThreadListAutoAnimateRef = useCallback((node: HTMLElement | null) => {
    if (!node || animatedThreadListsRef.current.has(node)) {
      return;
    }
    autoAnimate(node, SIDEBAR_LIST_ANIMATION_OPTIONS);
    animatedThreadListsRef.current.add(node);
  }, []);

  const visibleThreads = useMemo(
    () => sidebarThreads.filter((thread) => thread.archivedAt === null),
    [sidebarThreads],
  );
  const sortedProjects = useMemo(() => {
    const sortableProjects = sidebarProjects.map((project) => ({
      ...project,
      id: project.projectKey,
    }));
    const sortableThreads = visibleThreads.map((thread) => {
      const physicalKey =
        projectPhysicalKeyByScopedRef.get(
          scopedProjectKey(scopeProjectRef(thread.environmentId, thread.projectId)),
        ) ?? scopedProjectKey(scopeProjectRef(thread.environmentId, thread.projectId));
      return {
        ...thread,
        projectId: (physicalToLogicalKey.get(physicalKey) ?? physicalKey) as ProjectId,
      };
    });
    return sortProjectsForSidebar(
      sortableProjects,
      sortableThreads,
      sidebarProjectSortOrder,
    ).flatMap((project) => {
      const resolvedProject = sidebarProjectByKey.get(project.id);
      return resolvedProject ? [resolvedProject] : [];
    });
  }, [
    sidebarProjectSortOrder,
    physicalToLogicalKey,
    projectPhysicalKeyByScopedRef,
    sidebarProjectByKey,
    sidebarProjects,
    visibleThreads,
  ]);
  // Badges must reflect every group, including the ones the filter is hiding,
  // so this reads the unfiltered project list. Archived chats are dropped for
  // the same reason the rows drop them: they are not something to act on.
  const visibleThreadsByProjectKey = useMemo(() => {
    const next = new Map<string, SidebarThreadSummary[]>();
    for (const [projectKey, projectThreads] of threadsByProjectKey) {
      next.set(
        projectKey,
        projectThreads.filter((thread) => thread.archivedAt === null),
      );
    }
    return next;
  }, [threadsByProjectKey]);
  const projectGroupStatusById = useProjectGroupStatusById({
    groups: projectGroups,
    visibleThreadsByProjectKey,
  });
  // The group filter narrows the list before hiding is applied, so the
  // "Show N hidden repositories" shelf only ever counts projects inside the
  // group you are looking at.
  const activeProjectGroup = useMemo(
    () => resolveActiveProjectGroup(projectGroups, activeProjectGroupId),
    [activeProjectGroupId, projectGroups],
  );
  const groupFilteredProjects = useMemo(
    () => filterProjectsByGroup(sortedProjects, activeProjectGroup),
    [activeProjectGroup, sortedProjects],
  );
  // Hidden repositories drop out of every downstream consumer — thread jump
  // labels included — so a hidden project cannot own a shortcut you can't see.
  const { listed: listedProjects, hidden: hiddenProjects } = useMemo(
    () => partitionSidebarProjects(groupFilteredProjects, hiddenProjectKeys),
    [groupFilteredProjects, hiddenProjectKeys],
  );
  const shownProjects = useMemo(
    () => (showHiddenProjects ? [...listedProjects, ...hiddenProjects] : listedProjects),
    [hiddenProjects, listedProjects, showHiddenProjects],
  );
  const draftsByProjectKey = useMemo(() => {
    const next = new Map<
      string,
      Array<
        (typeof draftThreadsByThreadKey)[string] & {
          readonly draftId: DraftId;
        }
      >
    >();
    for (const [draftId, draft] of Object.entries(draftThreadsByThreadKey)) {
      const scopedKey = scopedProjectKey(scopeProjectRef(draft.environmentId, draft.projectId));
      const physicalKey = projectPhysicalKeyByScopedRef.get(scopedKey) ?? scopedKey;
      const logicalKey = physicalToLogicalKey.get(physicalKey) ?? physicalKey;
      const existing = next.get(logicalKey);
      const entry = { ...draft, draftId: DraftId.make(draftId) };
      if (existing) {
        existing.push(entry);
      } else {
        next.set(logicalKey, [entry]);
      }
    }
    return next;
  }, [draftThreadsByThreadKey, physicalToLogicalKey, projectPhysicalKeyByScopedRef]);
  const workspacesByProjectKey = useMemo(
    () =>
      new Map(
        shownProjects.map((project) => [
          project.projectKey,
          buildProjectWorkspaces({
            members: project.memberProjects,
            threads: threadsByProjectKey.get(project.projectKey) ?? [],
            drafts: draftsByProjectKey.get(project.projectKey) ?? [],
          }),
        ]),
      ),
    [draftsByProjectKey, shownProjects, threadsByProjectKey],
  );
  const workspaceByKey = useMemo(
    () =>
      new Map(
        [...workspacesByProjectKey.values()]
          .flat()
          .map((workspace) => [workspace.key, workspace] as const),
      ),
    [workspacesByProjectKey],
  );
  const pinnedWorkspaces = useMemo(
    () =>
      pinnedWorkspaceKeys.flatMap((workspaceKey) => {
        if (archivedWorkspaceKeys.includes(workspaceKey)) return [];
        const workspace = workspaceByKey.get(workspaceKey);
        return workspace ? [workspace] : [];
      }),
    [archivedWorkspaceKeys, pinnedWorkspaceKeys, workspaceByKey],
  );
  const archivedWorkspaces = useMemo(
    () =>
      archivedWorkspaceKeys.flatMap((workspaceKey) => {
        const workspace = workspaceByKey.get(workspaceKey);
        return workspace ? [workspace] : [];
      }),
    [archivedWorkspaceKeys, workspaceByKey],
  );
  // A repository that is removed and re-added must not come back invisible.
  // Wait for every environment to bootstrap first: a project belonging to an
  // environment that is still connecting is missing from `sortedProjects`, and
  // pruning then would silently unhide it the moment that environment lands.
  useEffect(() => {
    if (!allEnvironmentShellsBootstrapped || hiddenProjectKeys.length === 0) return;
    const knownKeys = new Set(sortedProjects.map((project) => project.projectKey));
    const pruned = pruneHiddenProjectKeys(hiddenProjectKeys, knownKeys);
    if (pruned === hiddenProjectKeys) return;
    updateSettings({ sidebarHiddenProjectKeys: pruned });
  }, [allEnvironmentShellsBootstrapped, hiddenProjectKeys, sortedProjects, updateSettings]);
  // A group deleted on another device leaves this one filtered by an id that
  // no longer resolves; fall back to "All projects" rather than showing an
  // empty sidebar.
  useEffect(() => {
    if (activeProjectGroupId === null) return;
    if (projectGroups.some((group) => group.id === activeProjectGroupId)) return;
    updateSettings({ sidebarActiveProjectGroupId: null });
  }, [activeProjectGroupId, projectGroups, updateSettings]);
  // Collapsing the shelf while everything is visible again would leave a
  // dangling "Hide hidden repositories" button with nothing behind it.
  useEffect(() => {
    if (hiddenProjects.length === 0 && showHiddenProjects) setShowHiddenProjects(false);
  }, [hiddenProjects.length, showHiddenProjects]);
  const isManualProjectSorting = sidebarProjectSortOrder === "manual";
  const visibleSidebarThreadKeys = useMemo(
    () =>
      shownProjects.flatMap((project) => {
        const projectThreads = sortThreads(
          (threadsByProjectKey.get(project.projectKey) ?? []).filter(
            (thread) => thread.archivedAt === null,
          ),
          sidebarThreadSortOrder,
        );
        const projectExpanded = resolveProjectExpanded(
          projectExpandedById,
          projectExpansionPreferenceKeys(project),
        );
        const activeThreadKey = routeThreadKey ?? undefined;
        const pinnedCollapsedThread =
          !projectExpanded && activeThreadKey
            ? (projectThreads.find(
                (thread) =>
                  scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)) ===
                  activeThreadKey,
              ) ?? null)
            : null;
        const shouldShowThreadPanel = projectExpanded || pinnedCollapsedThread !== null;
        if (!shouldShowThreadPanel) {
          return [];
        }
        const isThreadListExpanded = expandedThreadListsByProject.has(project.projectKey);
        const hasOverflowingThreads = projectThreads.length > sidebarThreadPreviewCount;
        const previewThreads =
          isThreadListExpanded || !hasOverflowingThreads
            ? projectThreads
            : projectThreads.slice(0, sidebarThreadPreviewCount);
        const renderedThreads = pinnedCollapsedThread ? [pinnedCollapsedThread] : previewThreads;
        return renderedThreads.map((thread) =>
          scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)),
        );
      }),
    [
      sidebarThreadSortOrder,
      sidebarThreadPreviewCount,
      expandedThreadListsByProject,
      projectExpandedById,
      routeThreadKey,
      shownProjects,
      threadsByProjectKey,
    ],
  );
  const threadJumpCommandByKey = useMemo(() => {
    const mapping = new Map<string, NonNullable<ReturnType<typeof threadJumpCommandForIndex>>>();
    for (const [visibleThreadIndex, threadKey] of visibleSidebarThreadKeys.entries()) {
      const jumpCommand = threadJumpCommandForIndex(visibleThreadIndex);
      if (!jumpCommand) {
        return mapping;
      }
      mapping.set(threadKey, jumpCommand);
    }

    return mapping;
  }, [visibleSidebarThreadKeys]);
  const threadJumpThreadKeys = useMemo(
    () => [...threadJumpCommandByKey.keys()],
    [threadJumpCommandByKey],
  );
  const sidebarShortcutContext = {
    terminalFocus: false,
    terminalOpen: routeTerminalOpen,
    modelPickerOpen: isModelPickerOpen(),
  };
  const threadJumpLabelByKey = useMemo(
    () =>
      buildThreadJumpLabelMap({
        keybindings,
        platform,
        terminalOpen: sidebarShortcutContext.terminalOpen,
        threadJumpCommandByKey,
      }),
    [keybindings, platform, sidebarShortcutContext.terminalOpen, threadJumpCommandByKey],
  );
  const shouldShowThreadJumpHintsNow = shouldShowThreadJumpHintsForModifiers(
    shortcutModifiers,
    keybindings,
    {
      platform,
      context: sidebarShortcutContext,
    },
  );
  const showThreadJumpHints = useThreadJumpHintsVisible(shouldShowThreadJumpHintsNow);
  const visibleThreadJumpLabelByKey = showThreadJumpHints
    ? threadJumpLabelByKey
    : EMPTY_THREAD_JUMP_LABELS;
  const orderedSidebarThreadKeys = visibleSidebarThreadKeys;
  const prewarmedSidebarThreadKeys = useMemo(
    () => getSidebarThreadIdsToPrewarm(visibleSidebarThreadKeys),
    [visibleSidebarThreadKeys],
  );
  const prewarmedSidebarThreadRefs = useMemo(
    () =>
      prewarmedSidebarThreadKeys.flatMap((threadKey) => {
        const ref = parseScopedThreadKey(threadKey);
        return ref ? [ref] : [];
      }),
    [prewarmedSidebarThreadKeys],
  );

  useEffect(() => {
    const onWindowKeyDown = (event: globalThis.KeyboardEvent) => {
      const shortcutContext = getCurrentSidebarShortcutContext();

      if (event.defaultPrevented || event.repeat) {
        return;
      }

      const command = resolveShortcutCommand(event, keybindings, {
        platform,
        context: shortcutContext,
      });
      const traversalDirection = threadTraversalDirectionFromCommand(command);
      if (traversalDirection !== null) {
        const targetThreadKey = resolveAdjacentThreadId({
          threadIds: orderedSidebarThreadKeys,
          currentThreadId: routeThreadKey,
          direction: traversalDirection,
        });
        if (!targetThreadKey) {
          return;
        }
        const targetThread = sidebarThreadByKey.get(targetThreadKey);
        if (!targetThread) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        navigateToThread(scopeThreadRef(targetThread.environmentId, targetThread.id));
        return;
      }

      const jumpIndex = threadJumpIndexFromCommand(command ?? "");
      if (jumpIndex === null) {
        return;
      }

      const targetThreadKey = threadJumpThreadKeys[jumpIndex];
      if (!targetThreadKey) {
        return;
      }
      const targetThread = sidebarThreadByKey.get(targetThreadKey);
      if (!targetThread) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      navigateToThread(scopeThreadRef(targetThread.environmentId, targetThread.id));
    };

    window.addEventListener("keydown", onWindowKeyDown);

    return () => {
      window.removeEventListener("keydown", onWindowKeyDown);
    };
  }, [
    getCurrentSidebarShortcutContext,
    keybindings,
    navigateToThread,
    orderedSidebarThreadKeys,
    platform,
    routeThreadKey,
    sidebarThreadByKey,
    threadJumpThreadKeys,
  ]);

  useEffect(() => {
    const onMouseDown = (event: globalThis.MouseEvent) => {
      if (!useThreadSelectionStore.getState().hasSelection()) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (!shouldClearThreadSelectionOnMouseDown(target)) return;
      clearSelection();
    };

    window.addEventListener("mousedown", onMouseDown);
    return () => {
      window.removeEventListener("mousedown", onMouseDown);
    };
  }, [clearSelection]);

  const desktopUpdateButtonDisabled = isDesktopUpdateButtonDisabled(desktopUpdateState);
  const desktopUpdateButtonAction = desktopUpdateState
    ? resolveDesktopUpdateButtonAction(desktopUpdateState)
    : "none";
  const showArm64IntelBuildWarning =
    isElectron && shouldShowArm64IntelBuildWarning(desktopUpdateState);
  const arm64IntelBuildWarningDescription =
    desktopUpdateState && showArm64IntelBuildWarning
      ? getArm64IntelBuildWarningDescription(desktopUpdateState)
      : null;
  const commandPaletteShortcutLabel = shortcutLabelForCommand(
    keybindings,
    "commandPalette.toggle",
    newThreadShortcutLabelOptions,
  );
  const handleDesktopUpdateButtonClick = useCallback(() => {
    const bridge = window.desktopBridge;
    if (!bridge || !desktopUpdateState) return;
    if (desktopUpdateButtonDisabled || desktopUpdateButtonAction === "none") return;

    if (desktopUpdateButtonAction === "download") {
      void bridge
        .downloadUpdate()
        .then((result) => {
          if (result.completed) {
            showDesktopUpdateDownloadedToast(bridge, result.state);
          }
          if (!shouldToastDesktopUpdateActionResult(result)) return;
          const actionError = getDesktopUpdateActionError(result);
          if (!actionError) return;
          toastManager.add(
            stackedThreadToast({
              type: "error",
              title: "Could not download update",
              description: actionError,
            }),
          );
        })
        .catch((error) => {
          toastManager.add(
            stackedThreadToast({
              type: "error",
              title: "Could not start update download",
              description: error instanceof Error ? error.message : "An unexpected error occurred.",
            }),
          );
        });
      return;
    }

    if (desktopUpdateButtonAction === "install") {
      const confirmed = window.confirm(
        getDesktopUpdateInstallConfirmationMessage(desktopUpdateState),
      );
      if (!confirmed) return;
      void bridge
        .installUpdate()
        .then((result) => {
          if (!shouldToastDesktopUpdateActionResult(result)) return;
          const actionError = getDesktopUpdateActionError(result);
          if (!actionError) return;
          toastManager.add(
            stackedThreadToast({
              type: "error",
              title: "Could not install update",
              description: actionError,
            }),
          );
        })
        .catch((error) => {
          toastManager.add(
            stackedThreadToast({
              type: "error",
              title: "Could not install update",
              description: error instanceof Error ? error.message : "An unexpected error occurred.",
            }),
          );
        });
    }
  }, [desktopUpdateButtonAction, desktopUpdateButtonDisabled, desktopUpdateState]);

  const expandThreadListForProject = useCallback((projectKey: string) => {
    setExpandedThreadListsByProject((current) => {
      if (current.has(projectKey)) return current;
      const next = new Set(current);
      next.add(projectKey);
      return next;
    });
  }, []);

  const collapseThreadListForProject = useCallback((projectKey: string) => {
    setExpandedThreadListsByProject((current) => {
      if (!current.has(projectKey)) return current;
      const next = new Set(current);
      next.delete(projectKey);
      return next;
    });
  }, []);

  // "Expand all" only stops being the next action once every visible project is open,
  // so a single half-collapsed project keeps the button in expand mode.
  const areAllProjectsExpanded = useMemo(
    () =>
      shownProjects.length > 0 &&
      shownProjects.every((project) =>
        resolveProjectExpanded(projectExpandedById, projectExpansionPreferenceKeys(project)),
      ),
    [projectExpandedById, shownProjects],
  );

  const toggleAllProjectsExpanded = useCallback(() => {
    setProjectExpandedInStore(
      shownProjects.flatMap((project) => projectExpansionPreferenceKeys(project)),
      !areAllProjectsExpanded,
    );
  }, [areAllProjectsExpanded, setProjectExpandedInStore, shownProjects]);

  return (
    <>
      {prewarmedSidebarThreadRefs.map((threadRef) => (
        <SidebarThreadDetailPrewarmer key={scopedThreadKey(threadRef)} threadRef={threadRef} />
      ))}
      <SidebarChromeHeader isElectron={isElectron} />

      {isOnSettings ? (
        <SettingsSidebarNav pathname={pathname} />
      ) : (
        <SidebarRouteThreadKeyContext.Provider value={routeTabKey}>
          <SidebarProjectsContent
            showArm64IntelBuildWarning={showArm64IntelBuildWarning}
            arm64IntelBuildWarningDescription={arm64IntelBuildWarningDescription}
            desktopUpdateButtonAction={desktopUpdateButtonAction}
            desktopUpdateButtonDisabled={desktopUpdateButtonDisabled}
            handleDesktopUpdateButtonClick={handleDesktopUpdateButtonClick}
            projectSortOrder={sidebarProjectSortOrder}
            updateSettings={updateSettings}
            openAddProject={openAddProjectCommandPalette}
            isManualProjectSorting={isManualProjectSorting}
            projectDnDSensors={projectDnDSensors}
            projectCollisionDetection={projectCollisionDetection}
            handleProjectDragStart={handleProjectDragStart}
            handleProjectDragEnd={handleProjectDragEnd}
            handleProjectDragCancel={handleProjectDragCancel}
            handleNewThread={handleNewThread}
            archiveThread={archiveThread}
            deleteThread={deleteThread}
            sortedProjects={shownProjects}
            workspacesByProjectKey={workspacesByProjectKey}
            pinnedWorkspaces={pinnedWorkspaces}
            archivedWorkspaces={archivedWorkspaces}
            workspaceThreadByKey={sidebarThreadByKey}
            hiddenProjectCount={hiddenProjects.length}
            showHiddenProjects={showHiddenProjects}
            onToggleShowHiddenProjects={toggleShowHiddenProjects}
            expandedThreadListsByProject={expandedThreadListsByProject}
            routeThreadKey={routeThreadKey}
            newThreadShortcutLabel={newThreadShortcutLabel}
            commandPaletteShortcutLabel={commandPaletteShortcutLabel}
            threadJumpLabelByKey={visibleThreadJumpLabelByKey}
            attachThreadListAutoAnimateRef={attachThreadListAutoAnimateRef}
            expandThreadListForProject={expandThreadListForProject}
            collapseThreadListForProject={collapseThreadListForProject}
            areAllProjectsExpanded={areAllProjectsExpanded}
            onToggleAllProjectsExpanded={toggleAllProjectsExpanded}
            dragInProgressRef={dragInProgressRef}
            suppressProjectClickAfterDragRef={suppressProjectClickAfterDragRef}
            suppressProjectClickForContextMenuRef={suppressProjectClickForContextMenuRef}
            attachProjectListAutoAnimateRef={attachProjectListAutoAnimateRef}
            projectsLength={projects.length}
            projectGroupStatusById={projectGroupStatusById}
          />
          <SidebarChromeFooter />
        </SidebarRouteThreadKeyContext.Provider>
      )}
    </>
  );
}
