import type { ScopedProjectRef } from "@t3tools/contracts";
import { HistoryIcon, PlusIcon, RotateCcwIcon } from "lucide-react";
import { memo, useCallback, useMemo, useState } from "react";

import { cn } from "~/lib/utils";
import { DraftId, useComposerDraftStore } from "~/composerDraftStore";
import { resolveSessionStatusesByKey } from "~/components/chat/workspaceHistoryStatus";
import { Button } from "~/components/ui/button";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "~/components/ui/menu";
import { useSidebar } from "~/components/ui/sidebar";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import { useOpenThreadTab, type ThreadTabTarget } from "~/hooks/useThreadTabs";
import { useProject, useThreadShellsForProjectRefs } from "~/state/entities";
import { selectWorkspaceThreadTabs, useThreadTabsStore } from "~/threadTabsStore";
import { formatRelativeTimeLabel } from "~/timestampFormat";
import { useUiStateStore } from "~/uiStateStore";
import { buildProjectWorkspaces, selectClosedWorkspaceSessions } from "~/workspaceSessions";
import { SidebarChatStatusIcon } from "./SidebarChatStatusIcon";

const WORKSPACE_HISTORY_PAGE_SIZE = 20;

/**
 * The "new chat" and "chat history" buttons that sit on a workspace row. Both
 * act on that exact checkout, never on the project as a whole.
 */
export const SidebarWorkspaceRowActions = memo(function SidebarWorkspaceRowActions(props: {
  workspaceKey: string;
  projectRef: ScopedProjectRef;
  workspaceLabel: string;
  onNewThread: () => void;
  className?: string;
}) {
  const newThreadLabel = `New chat in ${props.workspaceLabel}`;
  return (
    <div className={cn("items-center gap-0.5", props.className)} data-workspace-row-actions>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              size="icon-xs"
              variant="ghost-muted"
              aria-label={newThreadLabel}
              data-testid="workspace-new-chat"
              onClick={props.onNewThread}
            />
          }
        >
          <PlusIcon />
        </TooltipTrigger>
        <TooltipPopup side="top">{newThreadLabel}</TooltipPopup>
      </Tooltip>
      {/* Last, so its menu opens past the sidebar edge instead of over "+". */}
      <WorkspaceHistoryMenu
        workspaceKey={props.workspaceKey}
        projectRef={props.projectRef}
        workspaceLabel={props.workspaceLabel}
      />
    </div>
  );
});

/**
 * Every workspace row carries this button, so the trigger stays cheap: the
 * chat and status subscriptions live in the items, which mount only while the
 * menu is open.
 */
const WorkspaceHistoryMenu = memo(function WorkspaceHistoryMenu(props: {
  workspaceKey: string;
  projectRef: ScopedProjectRef;
  workspaceLabel: string;
}) {
  const label = `Chat history for ${props.workspaceLabel}`;
  return (
    <Menu>
      <Tooltip>
        <TooltipTrigger
          render={
            <MenuTrigger
              render={
                <Button
                  size="icon-xs"
                  variant="ghost-muted"
                  aria-label={label}
                  data-testid="workspace-chat-history"
                />
              }
            />
          }
        >
          <HistoryIcon />
        </TooltipTrigger>
        <TooltipPopup side="top">Chat history</TooltipPopup>
      </Tooltip>
      <MenuPopup align="start" side="right" sideOffset={12} className="w-80">
        <WorkspaceHistoryMenuItems
          workspaceKey={props.workspaceKey}
          projectRef={props.projectRef}
        />
      </MenuPopup>
    </Menu>
  );
});

function WorkspaceHistoryMenuItems(props: { workspaceKey: string; projectRef: ScopedProjectRef }) {
  const project = useProject(props.projectRef);
  const openThreadTab = useOpenThreadTab();
  const { isMobile, setOpenMobile } = useSidebar();
  const [visibleSessionCount, setVisibleSessionCount] = useState(WORKSPACE_HISTORY_PAGE_SIZE);
  const openTabs = useThreadTabsStore(
    (state) => selectWorkspaceThreadTabs(state, props.workspaceKey).tabs,
  );
  const projectRefs = useMemo(() => [props.projectRef], [props.projectRef]);
  const threads = useThreadShellsForProjectRefs(projectRefs);
  const draftThreadsByThreadKey = useComposerDraftStore((state) => state.draftThreadsByThreadKey);
  const lastVisitedAtByThreadKey = useUiStateStore((state) => state.threadLastVisitedAtById);
  const closedSessions = useMemo(() => {
    if (!project) return [];
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
    return selectClosedWorkspaceSessions(
      workspace?.sessions ?? [],
      new Set(openTabs.map((tab) => tab.key)),
    );
  }, [draftThreadsByThreadKey, openTabs, project, props.workspaceKey, threads]);
  const statusBySessionKey = useMemo(
    () => resolveSessionStatusesByKey({ threads, lastVisitedAtByThreadKey }),
    [lastVisitedAtByThreadKey, threads],
  );
  const reopen = useCallback(
    (session: ThreadTabTarget) => {
      if (isMobile) setOpenMobile(false);
      openThreadTab(session);
    },
    [isMobile, openThreadTab, setOpenMobile],
  );
  const visibleSessions = closedSessions.slice(0, visibleSessionCount);
  const hiddenSessionCount = closedSessions.length - visibleSessions.length;

  return (
    <>
      {closedSessions.length === 0 ? (
        <MenuItem disabled>No closed chats in this workspace</MenuItem>
      ) : (
        visibleSessions.map((session) => (
          <MenuItem
            key={session.key}
            aria-label={`Reopen ${session.title}`}
            onClick={() => reopen(session)}
            className="group/history"
          >
            <SidebarChatStatusIcon status={statusBySessionKey.get(session.key) ?? "ready"} />
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
    </>
  );
}
