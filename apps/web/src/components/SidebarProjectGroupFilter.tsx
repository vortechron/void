import { ChevronDownIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useCallback, useState } from "react";

import { useClientSettings, useUpdateClientSettings } from "../hooks/useSettings";
import { randomUUID } from "~/lib/utils";
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
import {
  Menu,
  MenuGroup,
  MenuItem,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
} from "./ui/menu";
import { toastManager } from "./ui/toast";
import { SidebarWorkspaceStatusIcon } from "./SidebarWorkspaceStatusIcon";
import type { ThreadAttentionStatus } from "./sidebarWorkspaceStatus";
import {
  createProjectGroup,
  deleteProjectGroup,
  isValidProjectGroupName,
  projectGroupFilterLabel,
  projectGroupMemberCountLabel,
  renameProjectGroup,
  resolveActiveProjectGroup,
} from "./sidebarProjectGroups";

// The radio group needs a concrete value for "no filter"; a group id can never
// collide with it because ids are UUIDs.
const ALL_PROJECTS_FILTER_VALUE = "all";

/**
 * Replaces the static "Projects" heading with a filter. Picking a group hides
 * every project outside it; "All projects" restores the full list.
 */
export function SidebarProjectGroupFilter({
  statusByGroupId,
}: {
  /** Groups with nothing happening are absent, so no badge is drawn for them. */
  statusByGroupId: ReadonlyMap<string, ThreadAttentionStatus>;
}) {
  const projectGroups = useClientSettings((settings) => settings.sidebarProjectGroups);
  const activeGroupId = useClientSettings((settings) => settings.sidebarActiveProjectGroupId);
  const updateSettings = useUpdateClientSettings();
  const [isManageDialogOpen, setIsManageDialogOpen] = useState(false);

  const activeGroup = resolveActiveProjectGroup(projectGroups, activeGroupId);

  const selectGroup = useCallback(
    (value: string) => {
      updateSettings({
        sidebarActiveProjectGroupId: value === ALL_PROJECTS_FILTER_VALUE ? null : value,
      });
    },
    [updateSettings],
  );

  return (
    <>
      <Menu>
        <MenuTrigger
          aria-label="Filter projects by group"
          data-testid="sidebar-project-group-filter-trigger"
          className="-ml-1 inline-flex h-6 max-w-[65%] cursor-pointer items-center gap-1 rounded-md px-1 text-xs font-medium text-sidebar-muted-foreground/80 transition-colors hover:bg-accent hover:text-foreground"
        >
          <span className="truncate">{projectGroupFilterLabel(activeGroup)}</span>
          <ChevronDownIcon aria-hidden className="size-3 shrink-0 opacity-60" />
        </MenuTrigger>
        <MenuPopup align="start" side="bottom" className="min-w-52">
          <MenuGroup>
            <MenuRadioGroup
              value={activeGroup?.id ?? ALL_PROJECTS_FILTER_VALUE}
              onValueChange={(value) => selectGroup(value as string)}
            >
              <MenuRadioItem value={ALL_PROJECTS_FILTER_VALUE} className="min-h-7 py-1 sm:text-xs">
                All projects
              </MenuRadioItem>
              {projectGroups.map((group) => {
                const status = statusByGroupId.get(group.id);
                return (
                  <MenuRadioItem
                    key={group.id}
                    value={group.id}
                    className="min-h-7 py-1 sm:text-xs"
                  >
                    <span className="flex w-full min-w-0 items-center justify-between gap-2">
                      <span className="truncate">{group.name}</span>
                      {status ? <SidebarWorkspaceStatusIcon status={status} /> : null}
                    </span>
                  </MenuRadioItem>
                );
              })}
            </MenuRadioGroup>
          </MenuGroup>
          <MenuSeparator />
          <MenuGroup>
            <MenuItem
              className="min-h-7 py-1 sm:text-xs"
              data-testid="sidebar-manage-project-groups"
              onClick={() => setIsManageDialogOpen(true)}
            >
              Manage groups...
            </MenuItem>
          </MenuGroup>
        </MenuPopup>
      </Menu>

      <ManageProjectGroupsDialog open={isManageDialogOpen} onOpenChange={setIsManageDialogOpen} />
    </>
  );
}

function ManageProjectGroupsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const projectGroups = useClientSettings((settings) => settings.sidebarProjectGroups);
  const activeGroupId = useClientSettings((settings) => settings.sidebarActiveProjectGroupId);
  const updateSettings = useUpdateClientSettings();
  const [newGroupName, setNewGroupName] = useState("");

  const handleCreate = useCallback(() => {
    const trimmed = newGroupName.trim();
    if (trimmed.length === 0) return;
    if (!isValidProjectGroupName(projectGroups, trimmed)) {
      toastManager.add({ type: "warning", title: `A group named "${trimmed}" already exists` });
      return;
    }
    updateSettings({
      sidebarProjectGroups: createProjectGroup(projectGroups, {
        id: randomUUID(),
        name: trimmed,
      }),
    });
    setNewGroupName("");
  }, [newGroupName, projectGroups, updateSettings]);

  const handleRename = useCallback(
    (groupId: string, name: string) => {
      const next = renameProjectGroup(projectGroups, groupId, name);
      if (next === projectGroups) {
        toastManager.add({ type: "warning", title: `A group named "${name}" already exists` });
        return false;
      }
      updateSettings({ sidebarProjectGroups: next });
      return true;
    },
    [projectGroups, updateSettings],
  );

  // Deleting the group the sidebar is filtered by would leave the list stuck
  // on a group that no longer exists, so fall back to "All projects".
  const handleDelete = useCallback(
    (groupId: string) => {
      updateSettings({
        sidebarProjectGroups: deleteProjectGroup(projectGroups, groupId),
        ...(activeGroupId === groupId ? { sidebarActiveProjectGroupId: null } : {}),
      });
    },
    [activeGroupId, projectGroups, updateSettings],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Manage groups</DialogTitle>
          <DialogDescription>
            Groups filter the sidebar project list. Add or remove a project by right-clicking it in
            the sidebar. A project can belong to several groups.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="space-y-4">
          <div className="grid gap-1.5">
            <span className="text-xs font-medium text-foreground">New group</span>
            <div className="flex items-center gap-2">
              <Input
                aria-label="New group name"
                placeholder="Group name"
                value={newGroupName}
                onChange={(event) => setNewGroupName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    handleCreate();
                  }
                }}
              />
              <Button
                variant="outline"
                disabled={newGroupName.trim().length === 0}
                onClick={handleCreate}
              >
                <PlusIcon aria-hidden className="size-3.5" />
                Add
              </Button>
            </div>
          </div>

          {projectGroups.length === 0 ? (
            <p className="text-xs text-muted-foreground">No groups yet.</p>
          ) : (
            <ul className="grid gap-2">
              {projectGroups.map((group) => (
                <ManageProjectGroupRow
                  key={group.id}
                  groupId={group.id}
                  name={group.name}
                  memberCountLabel={projectGroupMemberCountLabel(group)}
                  onRename={handleRename}
                  onDelete={handleDelete}
                />
              ))}
            </ul>
          )}
        </DialogPanel>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

/**
 * Keeps the in-progress name local so a rejected rename (blank or duplicate)
 * does not snap the field back mid-typing.
 */
function ManageProjectGroupRow({
  groupId,
  name,
  memberCountLabel,
  onRename,
  onDelete,
}: {
  groupId: string;
  name: string;
  memberCountLabel: string;
  onRename: (groupId: string, name: string) => boolean;
  onDelete: (groupId: string) => void;
}) {
  const [draftName, setDraftName] = useState(name);

  const commit = useCallback(() => {
    const trimmed = draftName.trim();
    if (trimmed === name) return;
    if (trimmed.length === 0) {
      setDraftName(name);
      return;
    }
    if (!onRename(groupId, trimmed)) {
      setDraftName(name);
    }
  }, [draftName, groupId, name, onRename]);

  return (
    <li className="flex items-center gap-2">
      <Input
        aria-label={`Rename group ${name}`}
        value={draftName}
        onChange={(event) => setDraftName(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
          }
          if (event.key === "Escape") {
            event.preventDefault();
            setDraftName(name);
          }
        }}
      />
      <span className="w-20 shrink-0 text-right text-xs text-muted-foreground">
        {memberCountLabel}
      </span>
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Delete group ${name}`}
        onClick={() => onDelete(groupId)}
      >
        <Trash2Icon aria-hidden className="size-3.5" />
      </Button>
    </li>
  );
}
