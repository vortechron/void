import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import type { ThreadEnvMode } from "@t3tools/contracts";
import { useCallback, useMemo, useState } from "react";

import { selectProjectGroupingSettings } from "../../logicalProject";
import { useClientSettings } from "../../hooks/useSettings";
import {
  buildSidebarProjectSnapshots,
  type SidebarProjectSnapshot,
} from "../../sidebarProjectGrouping";
import { useEnvironments, usePrimaryEnvironmentId } from "../../state/environments";
import { useProjects } from "../../state/entities";
import { projectEnvironment } from "../../state/projects";
import { useAtomCommand } from "../../state/use-atom-command";
import { resolveEnvModeLabel } from "../BranchToolbar.logic";
import { ProjectFavicon } from "../ProjectFavicon";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { stackedThreadToast, toastManager } from "../ui/toast";
import { SettingResetButton, SettingsRow, SettingsSection } from "./settingsLayout";

function useProjectGroups(): SidebarProjectSnapshot[] {
  const projects = useProjects();
  const groupingSettings = useClientSettings(selectProjectGroupingSettings);
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const { environments } = useEnvironments();
  const environmentLabelById = useMemo(
    () =>
      new Map(
        environments.map((environment) => [environment.environmentId, environment.label] as const),
      ),
    [environments],
  );

  return useMemo(
    () =>
      buildSidebarProjectSnapshots({
        projects,
        settings: groupingSettings,
        primaryEnvironmentId,
        resolveEnvironmentLabel: (environmentId) => environmentLabelById.get(environmentId) ?? null,
      }).sort((left, right) => left.displayName.localeCompare(right.displayName)),
    [environmentLabelById, groupingSettings, primaryEnvironmentId, projects],
  );
}

export function ProjectWorkspaceDefaultsSettings() {
  const groups = useProjectGroups();
  const updateProject = useAtomCommand(projectEnvironment.update, { reportFailure: false });
  const [savingProjectKey, setSavingProjectKey] = useState<string | null>(null);

  const updateGroupMode = useCallback(
    async (group: SidebarProjectSnapshot, mode: ThreadEnvMode | null) => {
      setSavingProjectKey(group.projectKey);
      try {
        for (const member of group.memberProjects) {
          const result = await updateProject({
            environmentId: member.environmentId,
            input: { projectId: member.id, defaultThreadEnvMode: mode },
          });
          if (result._tag !== "Failure") continue;
          if (!isAtomCommandInterrupted(result)) {
            const error = squashAtomCommandFailure(result);
            toastManager.add(
              stackedThreadToast({
                type: "error",
                title: `Could not update ${group.displayName}`,
                description:
                  error instanceof Error ? error.message : "The project was not updated.",
              }),
            );
          }
          return;
        }
      } finally {
        setSavingProjectKey(null);
      }
    },
    [updateProject],
  );

  if (groups.length === 0) return null;

  return (
    <SettingsSection id="project-new-thread-workspace" title="Project new-thread workspace">
      {groups.map((group) => {
        const storedMode = group.defaultThreadEnvMode ?? null;
        const isSaving = savingProjectKey === group.projectKey;
        return (
          <SettingsRow
            key={group.projectKey}
            title={
              <span className="inline-flex min-w-0 items-center gap-2">
                <ProjectFavicon
                  environmentId={group.environmentId}
                  cwd={group.workspaceRoot}
                  className="size-4 shrink-0"
                />
                <span className="truncate">{group.displayName}</span>
              </span>
            }
            description={`Overrides t3.json and the global default for ${
              group.groupedProjectCount === 1
                ? "this project"
                : `all ${group.groupedProjectCount} grouped checkouts`
            }.`}
            resetAction={
              storedMode !== null ? (
                <SettingResetButton
                  label={`${group.displayName} workspace`}
                  onClick={() => void updateGroupMode(group, null)}
                />
              ) : null
            }
            control={
              <Select
                value={storedMode ?? "inherit"}
                onValueChange={(value) => {
                  if (value === "local" || value === "worktree") {
                    void updateGroupMode(group, value);
                  } else if (value === "inherit") {
                    void updateGroupMode(group, null);
                  }
                }}
              >
                <SelectTrigger
                  className="w-full sm:w-44"
                  aria-label={`${group.displayName} new-thread workspace`}
                  disabled={isSaving}
                >
                  <SelectValue>
                    {storedMode === null ? "Use default" : resolveEnvModeLabel(storedMode)}
                  </SelectValue>
                </SelectTrigger>
                <SelectPopup align="end" alignItemWithTrigger={false}>
                  <SelectItem hideIndicator value="inherit">
                    Use t3.json or global
                  </SelectItem>
                  <SelectItem hideIndicator value="local">
                    {resolveEnvModeLabel("local")}
                  </SelectItem>
                  <SelectItem hideIndicator value="worktree">
                    {resolveEnvModeLabel("worktree")}
                  </SelectItem>
                </SelectPopup>
              </Select>
            }
          />
        );
      })}
    </SettingsSection>
  );
}
