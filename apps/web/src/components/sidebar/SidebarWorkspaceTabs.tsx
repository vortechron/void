import type { ContextMenuItem } from "@t3tools/contracts";
import { ChevronRightIcon, XIcon } from "lucide-react";
import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";

import { cn } from "~/lib/utils";
import { readLocalApi } from "~/localApi";
import { resolveThreadAttentionStatus } from "~/components/sidebarWorkspaceStatus";
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
import { useSidebar } from "~/components/ui/sidebar";
import { LONG_PRESS_TARGET_STYLE, useLongPressContextMenu } from "~/hooks/useLongPressContextMenu";
import { useOpenThreadTab } from "~/hooks/useThreadTabs";
import { useThreadShell } from "~/state/entities";
import {
  resolveThreadTabCloseFollow,
  selectWorkspaceThreadTabs,
  threadTabRef,
  useThreadTabsStore,
  type ThreadTab,
  type ThreadTabGroup,
  type ThreadTabGroupColor,
} from "~/threadTabsStore";
import { useUiStateStore } from "~/uiStateStore";
import { SidebarChatStatusIcon } from "./SidebarChatStatusIcon";

type TabContextMenuAction =
  | "group:new"
  | "group:add"
  | `group:add:${string}`
  | "group:remove"
  | "close"
  | "close-others"
  | "close-below"
  | "close-all";
type TabGroupContextMenuAction = "rename" | "colors" | `color:${ThreadTabGroupColor}` | "ungroup";
type TabGroupDialogState =
  | { readonly mode: "create"; readonly tabKey: string }
  | { readonly mode: "rename"; readonly groupId: string };
type ContextMenuPosition = { readonly x: number; readonly y: number };

const TAB_GROUP_COLOR_STYLES: Record<
  ThreadTabGroupColor,
  { readonly text: string; readonly dot: string; readonly rail: string }
> = {
  grey: {
    text: "text-zinc-700 dark:text-zinc-300",
    dot: "bg-zinc-500",
    rail: "border-zinc-500/40",
  },
  blue: {
    text: "text-blue-700 dark:text-blue-300",
    dot: "bg-blue-500",
    rail: "border-blue-500/40",
  },
  green: {
    text: "text-emerald-700 dark:text-emerald-300",
    dot: "bg-emerald-500",
    rail: "border-emerald-500/40",
  },
  yellow: {
    text: "text-amber-700 dark:text-amber-300",
    dot: "bg-amber-500",
    rail: "border-amber-500/40",
  },
  red: {
    text: "text-rose-700 dark:text-rose-300",
    dot: "bg-rose-500",
    rail: "border-rose-500/40",
  },
  purple: {
    text: "text-violet-700 dark:text-violet-300",
    dot: "bg-violet-500",
    rail: "border-violet-500/40",
  },
};
const TAB_GROUP_COLOR_OPTIONS = Object.keys(TAB_GROUP_COLOR_STYLES) as ThreadTabGroupColor[];
let nextThreadTabGroupId = 0;

/**
 * The chat on screen. The sidebar provides it once, so navigating re-renders
 * only the tab lists rather than every workspace row.
 */
export const SidebarRouteThreadKeyContext = createContext<string | null>(null);

/**
 * Runs a close and then moves the view if that close took away the chat on
 * screen — see `resolveThreadTabCloseFollow`.
 */
function useCloseThreadTabs(workspaceKey: string, onNewThread: () => void) {
  // Read through a ref so the close handlers, and the memoized rows holding
  // them, stay stable across navigation.
  const routeThreadKey = useContext(SidebarRouteThreadKeyContext);
  const routeThreadKeyRef = useRef(routeThreadKey);
  useEffect(() => {
    routeThreadKeyRef.current = routeThreadKey;
  }, [routeThreadKey]);
  const openThreadTab = useOpenThreadTab();
  return useCallback(
    (close: () => void) => {
      const before = selectWorkspaceThreadTabs(useThreadTabsStore.getState(), workspaceKey);
      close();
      const after = selectWorkspaceThreadTabs(useThreadTabsStore.getState(), workspaceKey);
      const follow = resolveThreadTabCloseFollow({
        routeThreadKey: routeThreadKeyRef.current,
        before,
        after,
      });
      if (follow.kind === "open") openThreadTab(follow.tab);
      else if (follow.kind === "new") onNewThread();
    },
    [onNewThread, openThreadTab, workspaceKey],
  );
}

/**
 * The chats open in one workspace, listed under its row. Activation navigates;
 * the route sync in `useThreadTabs` keeps the list in agreement when navigation
 * comes from anywhere else.
 */
export const SidebarWorkspaceTabList = memo(function SidebarWorkspaceTabList(props: {
  workspaceKey: string;
  workspaceLabel: string;
  /** Creates another chat session in this exact physical checkout. */
  onNewThread: () => void;
}) {
  const { workspaceKey, workspaceLabel, onNewThread } = props;
  const routeThreadKey = useContext(SidebarRouteThreadKeyContext);
  const { tabs, groups } = useThreadTabsStore((state) =>
    selectWorkspaceThreadTabs(state, workspaceKey),
  );
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
  const openThreadTab = useOpenThreadTab();
  const closeWithFollow = useCloseThreadTabs(workspaceKey, onNewThread);
  const { isMobile, setOpenMobile } = useSidebar();
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const [groupDialog, setGroupDialog] = useState<TabGroupDialogState | null>(null);
  const [groupName, setGroupName] = useState("");
  const [groupColor, setGroupColor] = useState<ThreadTabGroupColor>("blue");
  const chunks = useMemo(() => buildTabListChunks(tabs, groups), [groups, tabs]);

  const activate = useCallback(
    (tab: ThreadTab) => {
      if (isMobile) setOpenMobile(false);
      openThreadTab(tab);
    },
    [isMobile, openThreadTab, setOpenMobile],
  );

  const close = useCallback(
    (tab: ThreadTab) => closeWithFollow(() => closeTab(workspaceKey, tab.key)),
    [closeTab, closeWithFollow, workspaceKey],
  );

  const openTabContextMenu = useCallback(
    async (position: ContextMenuPosition, tab: ThreadTab) => {
      const api = readLocalApi();
      if (!api) return;

      const index = tabs.findIndex((entry) => entry.key === tab.key);
      if (index < 0) return;

      const items: ContextMenuItem<TabContextMenuAction>[] = [
        { id: "group:new", label: "Add to new group..." },
        ...(groups.length > 0
          ? [
              {
                id: "group:add" as const,
                label: "Add to group",
                children: groups.map((group) => ({
                  id: `group:add:${group.id}` as const,
                  label: tab.groupId === group.id ? `✓ ${group.name}` : group.name,
                  disabled: tab.groupId === group.id,
                })),
              },
            ]
          : []),
        ...(tab.groupId ? [{ id: "group:remove" as const, label: "Remove from group" }] : []),
        { id: "close", label: "Close", separatorBefore: true },
        { id: "close-others", label: "Close others", disabled: tabs.length <= 1 },
        { id: "close-below", label: "Close below", disabled: index >= tabs.length - 1 },
        { id: "close-all", label: "Close all" },
      ];

      const action = await api.contextMenu.show(items, position);
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
          closeWithFollow(() => closeOthers(workspaceKey, tab.key));
          break;
        case "close-below":
          closeWithFollow(() => closeToRight(workspaceKey, tab.key));
          break;
        case "close-all":
          closeWithFollow(() => closeAll(workspaceKey));
          break;
        case null:
          break;
      }
    },
    [
      addToGroup,
      close,
      closeAll,
      closeOthers,
      closeToRight,
      closeWithFollow,
      groups,
      removeFromGroup,
      tabs,
      workspaceKey,
    ],
  );

  const openTabGroupContextMenu = useCallback(
    async (position: ContextMenuPosition, group: ThreadTabGroup) => {
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
        { id: "ungroup", label: "Ungroup", separatorBefore: true },
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

  const handleDrop = useCallback(
    (targetKey: string) => {
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
    (groupId: string) => {
      if (!draggingKey) return;
      addToGroup(workspaceKey, draggingKey, groupId);
      setDraggingKey(null);
    },
    [addToGroup, draggingKey, workspaceKey],
  );

  const handleDragEnd = useCallback(() => setDraggingKey(null), []);

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
      updateGroup(workspaceKey, groupDialog.groupId, { name: groupName, color: groupColor });
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

  const renderTab = (tab: ThreadTab) => (
    <SidebarThreadTabRow
      key={tab.key}
      tab={tab}
      current={tab.key === routeThreadKey}
      dragging={tab.key === draggingKey}
      onActivate={activate}
      onClose={close}
      onOpenContextMenu={openTabContextMenu}
      onDragStart={setDraggingKey}
      onDragEnd={handleDragEnd}
      onDrop={handleDrop}
    />
  );

  if (tabs.length === 0) return null;

  return (
    <>
      {/* Indented so each chat's icon sits under the workspace label. */}
      <ul
        aria-label={`Open chats in ${workspaceLabel}`}
        className="flex min-w-0 flex-col gap-px pt-px pb-1 pl-10"
        data-workspace-tab-list
      >
        {chunks.map((chunk) =>
          chunk.kind === "tab" ? (
            renderTab(chunk.tab)
          ) : (
            <li key={chunk.group.id} className="flex min-w-0 flex-col">
              <ThreadTabGroupHeader
                group={chunk.group}
                tabCount={chunk.tabs.length}
                holdsCurrent={chunk.tabs.some((tab) => tab.key === routeThreadKey)}
                onToggle={() => toggleGroup(workspaceKey, chunk.group.id)}
                onOpenContextMenu={(position) =>
                  void openTabGroupContextMenu(position, chunk.group)
                }
                onDrop={() => handleGroupDrop(chunk.group.id)}
              />
              {chunk.group.collapsed ? null : (
                <ul
                  className={cn(
                    "ml-3 flex min-w-0 flex-col gap-px border-l-2 pl-1",
                    TAB_GROUP_COLOR_STYLES[chunk.group.color].rail,
                  )}
                >
                  {chunk.tabs.map(renderTab)}
                </ul>
              )}
            </li>
          ),
        )}
      </ul>

      <ThreadTabGroupDialog
        mode={groupDialog?.mode ?? null}
        name={groupName}
        color={groupColor}
        onNameChange={setGroupName}
        onColorChange={setGroupColor}
        onCancel={closeGroupDialog}
        onSubmit={submitGroupDialog}
      />
    </>
  );
});

type TabListChunk =
  | { readonly kind: "tab"; readonly tab: ThreadTab }
  | {
      readonly kind: "group";
      readonly group: ThreadTabGroup;
      readonly tabs: readonly ThreadTab[];
    };

function buildTabListChunks(
  tabs: readonly ThreadTab[],
  groups: readonly ThreadTabGroup[],
): readonly TabListChunk[] {
  const groupById = new Map(groups.map((group) => [group.id, group] as const));
  const chunks: TabListChunk[] = [];
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

function preventDragDefault(event: ReactDragEvent) {
  event.preventDefault();
}

function ThreadTabGroupDialog(props: {
  /** Null while closed. */
  mode: TabGroupDialogState["mode"] | null;
  name: string;
  color: ThreadTabGroupColor;
  onNameChange: (name: string) => void;
  onColorChange: (color: ThreadTabGroupColor) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  return (
    <Dialog
      open={props.mode !== null}
      onOpenChange={(open) => {
        if (!open) props.onCancel();
      }}
    >
      <DialogPopup className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {props.mode === "rename" ? "Rename tab group" : "New tab group"}
          </DialogTitle>
        </DialogHeader>
        <DialogPanel>
          <div className="flex flex-col gap-4">
            <div className="grid gap-1.5">
              <span className="text-xs font-medium text-foreground">Group name</span>
              <Input
                autoFocus
                aria-label="Tab group name"
                value={props.name}
                onChange={(event) => props.onNameChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    props.onSubmit();
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
                    aria-pressed={props.color === color}
                    onClick={() => props.onColorChange(color)}
                    className={cn(
                      "flex size-8 cursor-pointer items-center justify-center rounded-full ring-2 ring-transparent transition-shadow hover:ring-foreground/20 focus-visible:outline-hidden focus-visible:ring-ring",
                      props.color === color && "ring-foreground/50",
                    )}
                  >
                    <span
                      className={cn("size-4 rounded-full", TAB_GROUP_COLOR_STYLES[color].dot)}
                    />
                  </button>
                ))}
              </div>
            </fieldset>
          </div>
        </DialogPanel>
        <DialogFooter>
          <Button variant="outline" onClick={props.onCancel}>
            Cancel
          </Button>
          <Button disabled={!props.name.trim()} onClick={props.onSubmit}>
            {props.mode === "rename" ? "Save" : "Create group"}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

const ThreadTabGroupHeader = memo(function ThreadTabGroupHeader(props: {
  group: ThreadTabGroup;
  tabCount: number;
  holdsCurrent: boolean;
  onToggle: () => void;
  onOpenContextMenu: (position: ContextMenuPosition) => void;
  onDrop: () => void;
}) {
  const longPressHandlers = useLongPressContextMenu(props.onOpenContextMenu);
  const styles = TAB_GROUP_COLOR_STYLES[props.group.color];
  const action = props.group.collapsed ? "Expand" : "Collapse";

  return (
    <button
      type="button"
      aria-expanded={!props.group.collapsed}
      aria-label={`${action} ${props.group.name} group, ${props.tabCount} chats`}
      style={LONG_PRESS_TARGET_STYLE}
      onClick={props.onToggle}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        props.onOpenContextMenu({ x: event.clientX, y: event.clientY });
      }}
      onDragOver={preventDragDefault}
      onDrop={(event) => {
        event.preventDefault();
        props.onDrop();
      }}
      {...longPressHandlers}
      className={cn(
        "flex h-6 min-w-0 cursor-pointer select-none items-center gap-1.5 rounded-md px-2 text-2xs font-medium transition-colors hover:bg-sidebar-row-hover focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring",
        styles.text,
        props.holdsCurrent && props.group.collapsed && "bg-sidebar-row-active",
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
        <span className="ml-auto shrink-0 tabular-nums opacity-70">{props.tabCount}</span>
      ) : null}
    </button>
  );
});

const SidebarThreadTabRow = memo(function SidebarThreadTabRow(props: {
  tab: ThreadTab;
  current: boolean;
  dragging: boolean;
  onActivate: (tab: ThreadTab) => void;
  onClose: (tab: ThreadTab) => void;
  onOpenContextMenu: (position: ContextMenuPosition, tab: ThreadTab) => void;
  onDragStart: (key: string) => void;
  onDragEnd: () => void;
  onDrop: (targetKey: string) => void;
}) {
  const { tab, onActivate, onClose, onOpenContextMenu, onDragStart, onDrop } = props;
  const ref = useMemo(() => threadTabRef(tab), [tab]);
  const shell = useThreadShell(ref);
  const lastVisitedAt = useUiStateStore((state) => state.threadLastVisitedAtById[tab.key]);
  const markThreadVisited = useUiStateStore((state) => state.markThreadVisited);
  const title = shell?.title?.trim() || "New thread";
  const status = shell ? resolveThreadAttentionStatus({ ...shell, lastVisitedAt }) : "ready";
  const handleActivate = useCallback(() => {
    if (shell) markThreadVisited(tab.key, shell.updatedAt);
    onActivate(tab);
  }, [markThreadVisited, onActivate, shell, tab]);
  // HTML5 drag never starts from touch on iPadOS, and the hook only arms for
  // touch, so the two cannot collide.
  const longPressHandlers = useLongPressContextMenu(
    useCallback(
      (position: ContextMenuPosition) => onOpenContextMenu(position, tab),
      [onOpenContextMenu, tab],
    ),
  );

  return (
    <li
      data-thread-tab={tab.key}
      draggable
      style={LONG_PRESS_TARGET_STYLE}
      onDragStart={() => onDragStart(tab.key)}
      onDragEnd={props.onDragEnd}
      onDragOver={preventDragDefault}
      onDrop={(event) => {
        event.preventDefault();
        onDrop(tab.key);
      }}
      onMouseDown={(event: ReactMouseEvent) => {
        // Middle-click scrolls by default; claim it before the browser does.
        if (event.button === 1) event.preventDefault();
      }}
      onAuxClick={(event) => {
        if (event.button !== 1) return;
        event.preventDefault();
        event.stopPropagation();
        onClose(tab);
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onOpenContextMenu({ x: event.clientX, y: event.clientY }, tab);
      }}
      {...longPressHandlers}
      className={cn(
        "group/tab flex h-7 min-w-0 select-none items-center rounded-md text-xs transition-colors",
        props.current
          ? "bg-sidebar-row-active font-medium text-sidebar-foreground"
          : "text-sidebar-muted-foreground/85 hover:bg-sidebar-row-hover hover:text-sidebar-foreground",
        props.dragging && "opacity-50",
      )}
    >
      <button
        type="button"
        aria-current={props.current ? "page" : undefined}
        onClick={handleActivate}
        className="flex h-full min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded-md pl-2 pr-1 text-left focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <SidebarChatStatusIcon status={status} />
        <span className="truncate">{title}</span>
      </button>
      <button
        type="button"
        aria-label={`Close ${title}`}
        onClick={() => onClose(tab)}
        className={cn(
          "mr-1 flex size-5 shrink-0 cursor-pointer items-center justify-center rounded text-muted-foreground hover:bg-sidebar-row-hover hover:text-foreground focus-visible:pointer-events-auto focus-visible:opacity-100 focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring",
          props.current
            ? "opacity-60 hover:opacity-100"
            : "pointer-events-none opacity-0 group-hover/tab:pointer-events-auto group-hover/tab:opacity-100 pointer-coarse:pointer-events-auto pointer-coarse:opacity-100",
        )}
      >
        <XIcon className="size-3" />
      </button>
    </li>
  );
});
