import type { ContextMenuItem, ScopedProjectRef } from "@t3tools/contracts";
import {
  ChevronRightIcon,
  HistoryIcon,
  MessageSquareTextIcon,
  PlusIcon,
  RotateCcwIcon,
  XIcon,
} from "lucide-react";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { useNavigate } from "@tanstack/react-router";

import { cn } from "~/lib/utils";
import { readLocalApi } from "~/localApi";
import { DraftId, useComposerDraftStore } from "~/composerDraftStore";
import {
  resolveThreadAttentionStatus,
  type ThreadAttentionStatus,
} from "~/components/sidebarWorkspaceStatus";
import { ScrollArea } from "~/components/ui/scroll-area";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "~/components/ui/menu";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import { LONG_PRESS_TARGET_STYLE, useLongPressContextMenu } from "~/hooks/useLongPressContextMenu";
import { useProject, useThreadShell, useThreadShellsForProjectRefs } from "~/state/entities";
import { buildDraftThreadRouteParams, buildThreadRouteParams } from "~/threadRoutes";
import { formatRelativeTimeLabel } from "~/timestampFormat";
import { useUiStateStore } from "~/uiStateStore";
import {
  selectThreadTab,
  selectWorkspaceThreadTabs,
  threadTabRef,
  useThreadTabsStore,
  type ThreadTab,
  type ThreadTabGroup,
  type ThreadTabGroupColor,
} from "~/threadTabsStore";
import {
  buildProjectWorkspaces,
  selectClosedWorkspaceSessions,
  type WorkspaceSession,
} from "~/workspaceSessions";
import { ThreadTabStatusIcon } from "./ThreadTabStatusIcon";
import { EMPTY_SESSION_STATUSES, resolveSessionStatusesByKey } from "./workspaceHistoryStatus";

type TabContextMenuAction =
  | "group:new"
  | "group:add"
  | `group:add:${string}`
  | "group:remove"
  | "close"
  | "close-others"
  | "close-to-right"
  | "close-all";
type TabGroupContextMenuAction = "rename" | "colors" | `color:${ThreadTabGroupColor}` | "ungroup";
type TabGroupDialogState =
  | { readonly mode: "create"; readonly tabKey: string }
  | { readonly mode: "rename"; readonly groupId: string };

const TAB_GROUP_COLOR_STYLES: Record<
  ThreadTabGroupColor,
  { readonly surface: string; readonly text: string; readonly dot: string }
> = {
  grey: {
    surface: "bg-zinc-500/10 ring-zinc-500/25",
    text: "text-zinc-700 dark:text-zinc-300",
    dot: "bg-zinc-500",
  },
  blue: {
    surface: "bg-blue-500/10 ring-blue-500/25",
    text: "text-blue-700 dark:text-blue-300",
    dot: "bg-blue-500",
  },
  green: {
    surface: "bg-emerald-500/10 ring-emerald-500/25",
    text: "text-emerald-700 dark:text-emerald-300",
    dot: "bg-emerald-500",
  },
  yellow: {
    surface: "bg-amber-500/10 ring-amber-500/25",
    text: "text-amber-700 dark:text-amber-300",
    dot: "bg-amber-500",
  },
  red: {
    surface: "bg-rose-500/10 ring-rose-500/25",
    text: "text-rose-700 dark:text-rose-300",
    dot: "bg-rose-500",
  },
  purple: {
    surface: "bg-violet-500/10 ring-violet-500/25",
    text: "text-violet-700 dark:text-violet-300",
    dot: "bg-violet-500",
  },
};
const TAB_GROUP_COLOR_OPTIONS = Object.keys(TAB_GROUP_COLOR_STYLES) as ThreadTabGroupColor[];
const WORKSPACE_HISTORY_PAGE_SIZE = 20;
let nextThreadTabGroupId = 0;

/**
 * Tab strip for the threads you have open, sitting directly under the
 * workspace header. Activation navigates; the route sync in `useThreadTabs`
 * puts the strip back in agreement when navigation comes from anywhere else.
 */
export const ThreadTabs = memo(function ThreadTabs(props: {
  workspaceKey: string;
  projectRef: ScopedProjectRef;
  /** Creates another chat session in this exact physical checkout. */
  onNewThread: () => void;
  newThreadLabel: string;
}) {
  const { workspaceKey, projectRef, onNewThread, newThreadLabel } = props;
  const navigate = useNavigate();
  const tabState = useThreadTabsStore((state) => selectWorkspaceThreadTabs(state, workspaceKey));
  const { tabs, activeKey, groups } = tabState;
  const closeTab = useThreadTabsStore((state) => state.closeTab);
  const closeOthers = useThreadTabsStore((state) => state.closeOthers);
  const closeToRight = useThreadTabsStore((state) => state.closeToRight);
  const closeAll = useThreadTabsStore((state) => state.closeAll);
  const moveTab = useThreadTabsStore((state) => state.moveTab);
  const createGroup = useThreadTabsStore((state) => state.createGroup);
  const addToGroup = useThreadTabsStore((state) => state.addToGroup);
  const removeFromGroup = useThreadTabsStore((state) => state.removeFromGroup);
  const toggleGroup = useThreadTabsStore((state) => state.toggleGroup);
  const updateGroup = useThreadTabsStore((state) => state.updateGroup);
  const ungroup = useThreadTabsStore((state) => state.ungroup);
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const [groupDialog, setGroupDialog] = useState<TabGroupDialogState | null>(null);
  const [groupName, setGroupName] = useState("");
  const [groupColor, setGroupColor] = useState<ThreadTabGroupColor>("blue");
  const tabListRef = useRef<HTMLDivElement>(null);
  const openSessionKeys = useMemo(() => tabs.map((tab) => tab.key), [tabs]);
  const tabStripChunks = useMemo(() => buildTabStripChunks(tabs, groups), [groups, tabs]);

  const activate = useCallback(
    (tab: ThreadTab | WorkspaceSession) => {
      if (tab.draftId) {
        void navigate({
          to: "/draft/$draftId",
          params: buildDraftThreadRouteParams(tab.draftId),
        });
        return;
      }
      void navigate({
        to: "/$environmentId/$threadId",
        params: buildThreadRouteParams(threadTabRef(tab)),
      });
    },
    [navigate],
  );

  // Closing the active tab hands focus to a neighbour, so the route has to
  // follow the store rather than the click. Closing the last tab starts a blank
  // chat in the same workspace, keeping its closed-chat history reachable.
  const followActiveTab = useCallback(() => {
    const next = selectWorkspaceThreadTabs(useThreadTabsStore.getState(), workspaceKey);
    const nextTab = next.tabs.find((entry) => entry.key === next.activeKey);
    if (nextTab) {
      activate(nextTab);
      return;
    }
    onNewThread();
  }, [activate, onNewThread, workspaceKey]);

  const close = useCallback(
    (tab: ThreadTab) => {
      const wasActive = tab.key === activeKey;
      closeTab(workspaceKey, tab.key);
      if (wasActive) followActiveTab();
    },
    [activeKey, closeTab, followActiveTab, workspaceKey],
  );

  // A chat closed on another device leaves this one the same way. The signal
  // present at mount is stale (it landed while another page was showing), so
  // only one that arrives while this strip is up moves the view.
  const remotelyClosed = useThreadTabsStore((state) => state.remotelyClosedActiveTab);
  const handledRemotelyClosed = useRef(remotelyClosed);
  useEffect(() => {
    if (remotelyClosed === handledRemotelyClosed.current) return;
    handledRemotelyClosed.current = remotelyClosed;
    if (remotelyClosed?.workspaceKey === workspaceKey) followActiveTab();
  }, [followActiveTab, remotelyClosed, workspaceKey]);

  const openTabContextMenu = useCallback(
    async (position: { readonly x: number; readonly y: number }, tab: ThreadTab) => {
      const api = readLocalApi();
      if (!api) return;

      const index = tabs.findIndex((entry) => entry.key === tab.key);
      if (index < 0) return;

      const groupItems: ContextMenuItem<TabContextMenuAction>[] = [
        { id: "group:new", label: "Add tab to new group..." },
        ...(groups.length > 0
          ? [
              {
                id: "group:add" as const,
                label: "Add tab to group",
                children: groups.map((group) => ({
                  id: `group:add:${group.id}` as const,
                  label: tab.groupId === group.id ? `✓ ${group.name}` : group.name,
                  disabled: tab.groupId === group.id,
                })),
              },
            ]
          : []),
        ...(tab.groupId ? [{ id: "group:remove" as const, label: "Remove from group" }] : []),
      ];
      const items: ContextMenuItem<TabContextMenuAction>[] = [
        ...groupItems,
        { id: "close", label: "Close", separatorBefore: true },
        { id: "close-others", label: "Close others", disabled: tabs.length <= 1 },
        { id: "close-to-right", label: "Close to the right", disabled: index >= tabs.length - 1 },
        { id: "close-all", label: "Close all" },
      ];

      const action = await api.contextMenu.show(items, { x: position.x, y: position.y });
      if (action?.startsWith("group:add:")) {
        addToGroup(workspaceKey, tab.key, action.slice("group:add:".length));
        return;
      }
      switch (action) {
        case "group:new":
          setGroupName("");
          setGroupColor(TAB_GROUP_COLOR_OPTIONS[groups.length % TAB_GROUP_COLOR_OPTIONS.length]!);
          setGroupDialog({ mode: "create", tabKey: tab.key });
          break;
        case "group:remove":
          removeFromGroup(workspaceKey, tab.key);
          break;
        case "close":
          close(tab);
          break;
        case "close-others":
          closeOthers(workspaceKey, tab.key);
          activate(tab);
          break;
        case "close-to-right":
          {
            const previousActiveKey = selectWorkspaceThreadTabs(
              useThreadTabsStore.getState(),
              workspaceKey,
            ).activeKey;
            closeToRight(workspaceKey, tab.key);
            const nextState = selectWorkspaceThreadTabs(
              useThreadTabsStore.getState(),
              workspaceKey,
            );
            if (nextState.activeKey !== previousActiveKey) {
              const nextTab = selectThreadTab(nextState, nextState.activeKey);
              if (nextTab) activate(nextTab);
            }
          }
          break;
        case "close-all":
          closeAll(workspaceKey);
          onNewThread();
          break;
        case null:
          break;
      }
    },
    [
      activate,
      addToGroup,
      close,
      closeAll,
      closeOthers,
      closeToRight,
      groups,
      onNewThread,
      removeFromGroup,
      tabs,
      workspaceKey,
    ],
  );

  const openTabGroupContextMenu = useCallback(
    async (position: { readonly x: number; readonly y: number }, group: ThreadTabGroup) => {
      const api = readLocalApi();
      if (!api) return;
      const items: ContextMenuItem<TabGroupContextMenuAction>[] = [
        { id: "rename", label: "Rename group..." },
        {
          id: "colors",
          label: "Color",
          children: TAB_GROUP_COLOR_OPTIONS.map((color) => ({
            id: `color:${color}`,
            label: group.color === color ? `✓ ${capitalize(color)}` : capitalize(color),
          })),
        },
        { id: "ungroup", label: "Ungroup tabs", separatorBefore: true },
      ];
      const action = await api.contextMenu.show(items, position);
      if (action?.startsWith("color:")) {
        updateGroup(workspaceKey, group.id, {
          color: action.slice("color:".length) as ThreadTabGroupColor,
        });
        return;
      }
      if (action === "rename") {
        setGroupName(group.name);
        setGroupColor(group.color);
        setGroupDialog({ mode: "rename", groupId: group.id });
      } else if (action === "ungroup") {
        ungroup(workspaceKey, group.id);
      }
    },
    [ungroup, updateGroup, workspaceKey],
  );

  const handleContextMenu = useCallback(
    (event: ReactMouseEvent, tab: ThreadTab) => {
      event.preventDefault();
      event.stopPropagation();
      void openTabContextMenu({ x: event.clientX, y: event.clientY }, tab);
    },
    [openTabContextMenu],
  );

  const handleMouseDown = useCallback((event: ReactMouseEvent) => {
    // Middle-click scrolls by default; claim it before the browser does.
    if (event.button === 1) event.preventDefault();
  }, []);

  const handleAuxClick = useCallback(
    (event: ReactMouseEvent, tab: ThreadTab) => {
      if (event.button !== 1) return;
      event.preventDefault();
      event.stopPropagation();
      close(tab);
    },
    [close],
  );

  const handleDrop = useCallback(
    (event: ReactMouseEvent, targetKey: string) => {
      event.preventDefault();
      if (!draggingKey || draggingKey === targetKey) return;
      const withoutDragged = tabs.filter((entry) => entry.key !== draggingKey);
      const targetIndex = withoutDragged.findIndex((entry) => entry.key === targetKey);
      if (targetIndex < 0) return;
      const draggedIndex = tabs.findIndex((entry) => entry.key === draggingKey);
      const targetOriginalIndex = tabs.findIndex((entry) => entry.key === targetKey);
      moveTab(
        workspaceKey,
        draggingKey,
        draggedIndex < targetOriginalIndex ? targetIndex + 1 : targetIndex,
      );
    },
    [draggingKey, moveTab, tabs, workspaceKey],
  );

  const handleGroupDrop = useCallback(
    (event: ReactMouseEvent, groupId: string) => {
      event.preventDefault();
      if (!draggingKey) return;
      addToGroup(workspaceKey, draggingKey, groupId);
      setDraggingKey(null);
    },
    [addToGroup, draggingKey, workspaceKey],
  );

  const closeGroupDialog = useCallback(() => {
    setGroupDialog(null);
    setGroupName("");
  }, []);

  const submitGroupDialog = useCallback(() => {
    if (!groupDialog || !groupName.trim()) return;
    if (groupDialog.mode === "create") {
      createGroup(workspaceKey, groupDialog.tabKey, {
        id: createThreadTabGroupId(),
        name: groupName,
        color: groupColor,
      });
    } else {
      updateGroup(workspaceKey, groupDialog.groupId, {
        name: groupName,
        color: groupColor,
      });
    }
    closeGroupDialog();
  }, [
    closeGroupDialog,
    createGroup,
    groupColor,
    groupDialog,
    groupName,
    updateGroup,
    workspaceKey,
  ]);

  useEffect(() => {
    if (activeKey === null) return;
    const active = tabListRef.current?.querySelector<HTMLElement>("[data-active-tab='true']");
    active?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeKey]);

  const renderTab = (tab: ThreadTab) => (
    <ThreadTabButton
      key={tab.key}
      tab={tab}
      active={tab.key === activeKey}
      dragging={tab.key === draggingKey}
      onActivate={() => activate(tab)}
      onClose={() => close(tab)}
      onContextMenu={(event) => handleContextMenu(event, tab)}
      onLongPress={(position) => void openTabContextMenu(position, tab)}
      onMouseDown={handleMouseDown}
      onAuxClick={(event) => handleAuxClick(event, tab)}
      onDragStart={() => setDraggingKey(tab.key)}
      onDragEnd={() => setDraggingKey(null)}
      onDrop={(event) => handleDrop(event, tab.key)}
    />
  );

  if (tabs.length === 0) return null;

  return (
    <>
      <div
        className="flex h-9 shrink-0 items-center gap-1 border-b border-border/60 bg-background pl-2 pr-1"
        data-thread-tabbar
      >
        <ScrollArea
          ref={tabListRef}
          hideScrollbars
          scrollFade
          className="h-full min-w-0 flex-1 rounded-none"
          data-thread-tab-list
        >
          <div
            role="tablist"
            aria-label="Open threads"
            className="flex h-full w-max min-w-full items-center"
          >
            {tabStripChunks.map((chunk) =>
              chunk.kind === "tab" ? (
                renderTab(chunk.tab)
              ) : (
                <div
                  key={chunk.group.id}
                  className={cn(
                    "flex h-full shrink-0 items-center rounded-lg px-0.5 ring-1 ring-inset",
                    TAB_GROUP_COLOR_STYLES[chunk.group.color].surface,
                  )}
                  data-thread-tab-group={chunk.group.id}
                >
                  <ThreadTabGroupButton
                    group={chunk.group}
                    tabCount={chunk.tabs.length}
                    active={chunk.tabs.some((tab) => tab.key === activeKey)}
                    onToggle={() => toggleGroup(workspaceKey, chunk.group.id)}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      void openTabGroupContextMenu(
                        { x: event.clientX, y: event.clientY },
                        chunk.group,
                      );
                    }}
                    onLongPress={(position) => void openTabGroupContextMenu(position, chunk.group)}
                    onDrop={(event) => handleGroupDrop(event, chunk.group.id)}
                  />
                  {chunk.group.collapsed ? null : chunk.tabs.map(renderTab)}
                </div>
              ),
            )}
            {/* Inline rather than pinned right: the affordance belongs next to
                the last tab, where the new tab will appear. */}
            <div className="flex h-full shrink-0 items-center pl-1">
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button
                      type="button"
                      aria-label={newThreadLabel}
                      onClick={onNewThread}
                      className="inline-flex size-6 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <PlusIcon className="size-4" />
                    </button>
                  }
                />
                <TooltipPopup side="bottom">{newThreadLabel}</TooltipPopup>
              </Tooltip>
            </div>
          </div>
        </ScrollArea>
        <WorkspaceHistoryMenu
          workspaceKey={workspaceKey}
          projectRef={projectRef}
          openSessionKeys={openSessionKeys}
          onActivate={activate}
        />
      </div>

      <Dialog
        open={groupDialog !== null}
        onOpenChange={(open) => {
          if (!open) closeGroupDialog();
        }}
      >
        <DialogPopup className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {groupDialog?.mode === "rename" ? "Rename tab group" : "New tab group"}
            </DialogTitle>
          </DialogHeader>
          <DialogPanel className="space-y-4">
            <div className="grid gap-1.5">
              <span className="text-xs font-medium text-foreground">Group name</span>
              <Input
                autoFocus
                aria-label="Tab group name"
                value={groupName}
                onChange={(event) => setGroupName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    submitGroupDialog();
                  }
                }}
              />
            </div>
            <fieldset className="grid gap-2">
              <legend className="text-xs font-medium text-foreground">Color</legend>
              <div className="flex flex-wrap gap-2">
                {TAB_GROUP_COLOR_OPTIONS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    aria-label={`${capitalize(color)} group color`}
                    aria-pressed={groupColor === color}
                    onClick={() => setGroupColor(color)}
                    className={cn(
                      "flex size-8 cursor-pointer items-center justify-center rounded-full ring-2 ring-transparent transition-shadow hover:ring-foreground/20 focus-visible:outline-hidden focus-visible:ring-ring",
                      groupColor === color && "ring-foreground/50",
                    )}
                  >
                    <span
                      className={cn("size-4 rounded-full", TAB_GROUP_COLOR_STYLES[color].dot)}
                    />
                  </button>
                ))}
              </div>
            </fieldset>
          </DialogPanel>
          <DialogFooter>
            <Button variant="outline" onClick={closeGroupDialog}>
              Cancel
            </Button>
            <Button disabled={!groupName.trim()} onClick={submitGroupDialog}>
              {groupDialog?.mode === "rename" ? "Save" : "Create group"}
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </>
  );
});

type TabStripChunk =
  | { readonly kind: "tab"; readonly tab: ThreadTab }
  | {
      readonly kind: "group";
      readonly group: ThreadTabGroup;
      readonly tabs: readonly ThreadTab[];
    };

function buildTabStripChunks(
  tabs: readonly ThreadTab[],
  groups: readonly ThreadTabGroup[],
): readonly TabStripChunk[] {
  const groupById = new Map(groups.map((group) => [group.id, group] as const));
  const chunks: TabStripChunk[] = [];
  for (let index = 0; index < tabs.length; index += 1) {
    const tab = tabs[index]!;
    const group = tab.groupId ? groupById.get(tab.groupId) : undefined;
    if (!group) {
      chunks.push({ kind: "tab", tab });
      continue;
    }
    const groupTabs = [tab];
    while (tabs[index + 1]?.groupId === group.id) {
      index += 1;
      groupTabs.push(tabs[index]!);
    }
    chunks.push({ kind: "group", group, tabs: groupTabs });
  }
  return chunks;
}

function createThreadTabGroupId(): string {
  nextThreadTabGroupId += 1;
  return `tab-group-${Date.now().toString(36)}-${nextThreadTabGroupId.toString(36)}`;
}

function capitalize(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

const ThreadTabGroupButton = memo(function ThreadTabGroupButton(props: {
  group: ThreadTabGroup;
  tabCount: number;
  active: boolean;
  onToggle: () => void;
  onContextMenu: (event: ReactMouseEvent) => void;
  onLongPress: (position: { readonly x: number; readonly y: number }) => void;
  onDrop: (event: ReactMouseEvent) => void;
}) {
  const longPressHandlers = useLongPressContextMenu(props.onLongPress);
  const styles = TAB_GROUP_COLOR_STYLES[props.group.color];
  const action = props.group.collapsed ? "Expand" : "Collapse";

  return (
    <button
      type="button"
      aria-expanded={!props.group.collapsed}
      aria-label={`${action} ${props.group.name} group, ${props.tabCount} tabs`}
      data-active-tab-group={props.active}
      style={LONG_PRESS_TARGET_STYLE}
      onClick={props.onToggle}
      onContextMenu={props.onContextMenu}
      onDragOver={(event) => event.preventDefault()}
      onDrop={props.onDrop}
      {...longPressHandlers}
      className={cn(
        "mx-0.5 flex h-7 max-w-32 shrink-0 cursor-pointer select-none items-center gap-1 rounded-md px-1.5 text-xs font-medium transition-colors hover:bg-background/60 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
        styles.text,
        props.active && props.group.collapsed && "bg-background/75 shadow-sm",
      )}
    >
      <ChevronRightIcon
        className={cn(
          "size-3 shrink-0 transition-transform",
          !props.group.collapsed && "rotate-90",
        )}
      />
      <span className={cn("size-2 shrink-0 rounded-full", styles.dot)} />
      <span className="truncate">{props.group.name}</span>
      {props.group.collapsed ? (
        <span className="shrink-0 tabular-nums opacity-70">{props.tabCount}</span>
      ) : null}
    </button>
  );
});

const WorkspaceHistoryMenu = memo(function WorkspaceHistoryMenu(props: {
  workspaceKey: string;
  projectRef: ScopedProjectRef;
  openSessionKeys: readonly string[];
  onActivate: (session: WorkspaceSession) => void;
}) {
  const project = useProject(props.projectRef);
  const [open, setOpen] = useState(false);
  const [visibleSessionCount, setVisibleSessionCount] = useState(WORKSPACE_HISTORY_PAGE_SIZE);
  const projectRefs = useMemo(() => [props.projectRef], [props.projectRef]);
  const threads = useThreadShellsForProjectRefs(projectRefs);
  const draftThreadsByThreadKey = useComposerDraftStore((state) => state.draftThreadsByThreadKey);
  const closedSessions = useMemo(() => {
    if (!open || !project) return [];
    const workspaces = buildProjectWorkspaces({
      members: [
        {
          environmentId: project.environmentId,
          id: project.id,
          workspaceRoot: project.workspaceRoot,
        },
      ],
      threads,
      drafts: Object.entries(draftThreadsByThreadKey).map(([draftId, draft]) => ({
        ...draft,
        draftId: DraftId.make(draftId),
      })),
    });
    const workspace = workspaces.find((candidate) => candidate.key === props.workspaceKey);
    return selectClosedWorkspaceSessions(workspace?.sessions ?? [], new Set(props.openSessionKeys));
  }, [draftThreadsByThreadKey, open, project, props.openSessionKeys, props.workspaceKey, threads]);
  const lastVisitedAtByThreadKey = useUiStateStore((state) => state.threadLastVisitedAtById);
  // Same gate as `closedSessions`: a shut menu must not pay for status math.
  const statusBySessionKey = useMemo(
    () =>
      open
        ? resolveSessionStatusesByKey({ threads, lastVisitedAtByThreadKey })
        : EMPTY_SESSION_STATUSES,
    [lastVisitedAtByThreadKey, open, threads],
  );
  const visibleSessions = closedSessions.slice(0, visibleSessionCount);
  const hiddenSessionCount = closedSessions.length - visibleSessions.length;
  const handleOpenChange = useCallback((nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) setVisibleSessionCount(WORKSPACE_HISTORY_PAGE_SIZE);
  }, []);

  return (
    <div className="flex h-full shrink-0 items-center border-l border-border/60 pl-1">
      <Menu open={open} onOpenChange={handleOpenChange}>
        <Tooltip>
          <TooltipTrigger
            render={
              <MenuTrigger
                aria-label="Open chat history"
                className="inline-flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
              />
            }
          >
            <HistoryIcon className="size-4" />
          </TooltipTrigger>
          <TooltipPopup side="bottom">Chat history</TooltipPopup>
        </Tooltip>
        <MenuPopup align="end" side="bottom" className="w-80">
          {closedSessions.length === 0 ? (
            <MenuItem disabled>No closed chats in this workspace</MenuItem>
          ) : (
            visibleSessions.map((session) => (
              <MenuItem
                key={session.key}
                aria-label={`Reopen ${session.title}`}
                onClick={() => props.onActivate(session)}
                className="group/history"
              >
                <HistorySessionIcon status={statusBySessionKey.get(session.key) ?? "ready"} />
                <span className="min-w-0 flex-1 truncate">{session.title}</span>
                <span className="shrink-0 text-xs text-muted-foreground/70">
                  {formatRelativeTimeLabel(session.updatedAt)}
                </span>
                <RotateCcwIcon className="size-3.5 opacity-60 group-data-highlighted/history:opacity-100" />
              </MenuItem>
            ))
          )}
          {hiddenSessionCount > 0 ? (
            <MenuItem
              closeOnClick={false}
              onClick={() => setVisibleSessionCount((count) => count + WORKSPACE_HISTORY_PAGE_SIZE)}
            >
              Show older chats
              <span className="ml-auto text-xs text-muted-foreground/70">
                {hiddenSessionCount} more
              </span>
            </MenuItem>
          ) : null}
        </MenuPopup>
      </Menu>
    </div>
  );
});

/** A closed chat keeps the tab strip's status icon; the plain chat glyph is the
    resting state, so "nothing to do here" still looks like a chat row. */
function HistorySessionIcon({ status }: { readonly status: ThreadAttentionStatus }) {
  if (status === "ready") return <MessageSquareTextIcon className="size-4 shrink-0" />;
  return (
    <span className="flex size-4 shrink-0 items-center justify-center">
      <ThreadTabStatusIcon status={status} />
    </span>
  );
}

const ThreadTabButton = memo(function ThreadTabButton(props: {
  tab: ThreadTab;
  active: boolean;
  dragging: boolean;
  onActivate: () => void;
  onClose: () => void;
  onContextMenu: (event: ReactMouseEvent) => void;
  onLongPress: (position: { readonly x: number; readonly y: number }) => void;
  onMouseDown: (event: ReactMouseEvent) => void;
  onAuxClick: (event: ReactMouseEvent) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDrop: (event: ReactMouseEvent) => void;
}) {
  const ref = useMemo(() => threadTabRef(props.tab), [props.tab]);
  const shell = useThreadShell(ref);
  const tabKey = props.tab.key;
  const onActivate = props.onActivate;
  const lastVisitedAt = useUiStateStore((state) => state.threadLastVisitedAtById[tabKey]);
  const markThreadVisited = useUiStateStore((state) => state.markThreadVisited);
  const title = shell?.title?.trim() || "New thread";
  const status = shell ? resolveThreadAttentionStatus({ ...shell, lastVisitedAt }) : "ready";
  const handleActivate = useCallback(() => {
    if (shell) markThreadVisited(tabKey, shell.updatedAt);
    onActivate();
  }, [markThreadVisited, onActivate, shell, tabKey]);
  // HTML5 drag never starts from touch on iPadOS, and the hook only arms for
  // touch, so the two cannot collide.
  const longPressHandlers = useLongPressContextMenu(props.onLongPress);

  return (
    <div
      data-active-tab={props.active}
      draggable
      style={LONG_PRESS_TARGET_STYLE}
      onDragStart={props.onDragStart}
      onDragEnd={props.onDragEnd}
      onDragOver={(event) => event.preventDefault()}
      onDrop={props.onDrop}
      onMouseDown={props.onMouseDown}
      onAuxClick={props.onAuxClick}
      onContextMenu={props.onContextMenu}
      {...longPressHandlers}
      className={cn(
        "group relative flex h-9 min-w-24 max-w-44 shrink-0 select-none items-center gap-1.5 border-b-2 px-2.5 text-sm",
        props.active
          ? "border-foreground text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground",
        props.dragging && "opacity-50",
      )}
    >
      <button
        type="button"
        role="tab"
        aria-selected={props.active}
        onClick={handleActivate}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 focus-visible:outline-hidden"
      >
        <ThreadTabStatusIcon status={status} />
        <span className="truncate">{title}</span>
      </button>
      <button
        type="button"
        aria-label={`Close ${title}`}
        onClick={props.onClose}
        className={cn(
          "flex size-4 shrink-0 cursor-pointer items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:opacity-100",
          props.active
            ? "opacity-60 hover:opacity-100"
            : "pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 focus-visible:pointer-events-auto",
        )}
      >
        <XIcon className="size-3" />
      </button>
    </div>
  );
});
