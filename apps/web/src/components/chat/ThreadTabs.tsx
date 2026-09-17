import type { ContextMenuItem, ScopedProjectRef } from "@t3tools/contracts";
import { HistoryIcon, MessageSquareTextIcon, PlusIcon, RotateCcwIcon, XIcon } from "lucide-react";
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
} from "~/threadTabsStore";
import {
  buildProjectWorkspaces,
  selectClosedWorkspaceSessions,
  type WorkspaceSession,
} from "~/workspaceSessions";
import { ThreadTabStatusIcon } from "./ThreadTabStatusIcon";
import { EMPTY_SESSION_STATUSES, resolveSessionStatusesByKey } from "./workspaceHistoryStatus";

type TabContextMenuAction = "close" | "close-others" | "close-to-right" | "close-all";
const WORKSPACE_HISTORY_PAGE_SIZE = 20;

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
  const navigate = useNavigate();
  const tabState = useThreadTabsStore((state) =>
    selectWorkspaceThreadTabs(state, props.workspaceKey),
  );
  const { tabs, activeKey } = tabState;
  const closeTab = useThreadTabsStore((state) => state.closeTab);
  const closeOthers = useThreadTabsStore((state) => state.closeOthers);
  const closeToRight = useThreadTabsStore((state) => state.closeToRight);
  const closeAll = useThreadTabsStore((state) => state.closeAll);
  const moveTab = useThreadTabsStore((state) => state.moveTab);
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const tabListRef = useRef<HTMLDivElement>(null);
  const openSessionKeys = useMemo(() => tabs.map((tab) => tab.key), [tabs]);

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
  const close = useCallback(
    (tab: ThreadTab) => {
      const wasActive = tab.key === activeKey;
      closeTab(props.workspaceKey, tab.key);
      if (!wasActive) return;
      const next = selectWorkspaceThreadTabs(useThreadTabsStore.getState(), props.workspaceKey);
      const nextTab = next.tabs.find((entry) => entry.key === next.activeKey);
      if (nextTab) {
        activate(nextTab);
        return;
      }
      props.onNewThread();
    },
    [activate, activeKey, closeTab, props.onNewThread, props.workspaceKey],
  );

  const openTabContextMenu = useCallback(
    async (position: { readonly x: number; readonly y: number }, tab: ThreadTab) => {
      const api = readLocalApi();
      if (!api) return;

      const index = tabs.findIndex((entry) => entry.key === tab.key);
      if (index < 0) return;

      const items: ContextMenuItem<TabContextMenuAction>[] = [
        { id: "close", label: "Close" },
        { id: "close-others", label: "Close others", disabled: tabs.length <= 1 },
        { id: "close-to-right", label: "Close to the right", disabled: index >= tabs.length - 1 },
        { id: "close-all", label: "Close all" },
      ];

      const action = await api.contextMenu.show(items, { x: position.x, y: position.y });
      switch (action) {
        case "close":
          close(tab);
          break;
        case "close-others":
          closeOthers(props.workspaceKey, tab.key);
          activate(tab);
          break;
        case "close-to-right":
          {
            const previousActiveKey = selectWorkspaceThreadTabs(
              useThreadTabsStore.getState(),
              props.workspaceKey,
            ).activeKey;
            closeToRight(props.workspaceKey, tab.key);
            const nextState = selectWorkspaceThreadTabs(
              useThreadTabsStore.getState(),
              props.workspaceKey,
            );
            if (nextState.activeKey !== previousActiveKey) {
              const nextTab = selectThreadTab(nextState, nextState.activeKey);
              if (nextTab) activate(nextTab);
            }
          }
          break;
        case "close-all":
          closeAll(props.workspaceKey);
          props.onNewThread();
          break;
        case null:
          break;
      }
    },
    [
      activate,
      close,
      closeAll,
      closeOthers,
      closeToRight,
      props.onNewThread,
      props.workspaceKey,
      tabs,
    ],
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
        props.workspaceKey,
        draggingKey,
        draggedIndex < targetOriginalIndex ? targetIndex + 1 : targetIndex,
      );
    },
    [draggingKey, moveTab, props.workspaceKey, tabs],
  );

  useEffect(() => {
    const active = tabListRef.current?.querySelector<HTMLElement>("[data-active-tab='true']");
    active?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeKey]);

  if (tabs.length === 0) return null;

  return (
    <div
      className="flex h-9 shrink-0 items-center gap-1 border-b border-border/60 bg-background pl-2 pr-1"
      data-thread-tabbar
    >
      <ScrollArea
        ref={tabListRef}
        hideScrollbars
        scrollFade
        className="min-w-0 flex-1 rounded-none"
        data-thread-tab-list
      >
        <div
          role="tablist"
          aria-label="Open threads"
          className="flex h-full w-max min-w-full items-end"
        >
          {tabs.map((tab) => (
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
          ))}
          {/* Inline rather than pinned right: the affordance belongs next to
              the last tab, where the new tab will appear. */}
          <div className="flex h-9 shrink-0 items-center pl-1">
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    aria-label={props.newThreadLabel}
                    onClick={props.onNewThread}
                    className="inline-flex size-6 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <PlusIcon className="size-4" />
                  </button>
                }
              />
              <TooltipPopup side="bottom">{props.newThreadLabel}</TooltipPopup>
            </Tooltip>
          </div>
        </div>
      </ScrollArea>
      <WorkspaceHistoryMenu
        workspaceKey={props.workspaceKey}
        projectRef={props.projectRef}
        openSessionKeys={openSessionKeys}
        onActivate={activate}
      />
    </div>
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
  const projectRefs = useMemo(
    () => [props.projectRef],
    [props.projectRef.environmentId, props.projectRef.projectId],
  );
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
