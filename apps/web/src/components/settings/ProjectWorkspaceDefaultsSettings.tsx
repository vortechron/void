import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import type { ThreadEnvMode } from "@t3tools/contracts";
import { useCallback, useMemo, useRef, useState } from "react";

import { selectProjectGroupingSettings } from "@t3tools/client-runtime/state/project-grouping";
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
import {
  resolveGroupedProjectWorkspaceMode,
  updateGroupedProjectWorkspaceMode,
} from "./ProjectWorkspaceDefaultsSettings.logic";
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
  const savingRef = useRef(false);

  const updateGroupMode = useCallback(
    async (group: SidebarProjectSnapshot, mode: ThreadEnvMode | null) => {
      if (savingRef.current) return;
      savingRef.current = true;
      setSavingProjectKey(group.projectKey);
      try {
        const result = await updateGroupedProjectWorkspaceMode({
          members: group.memberProjects,
          nextMode: mode,
          currentMode: (member) => member.defaultThreadEnvMode ?? null,
          write: async (member, nextMode) => {
            const writeResult = await updateProject({
              environmentId: member.environmentId,
              input: { projectId: member.id, defaultThreadEnvMode: nextMode },
            });
            return writeResult._tag === "Failure"
              ? { _tag: "Failure", failure: writeResult }
              : { _tag: "Success" };
          },
        });
        if (
          result._tag === "Failure" &&
          (!isAtomCommandInterrupted(result.failure) || result.rollbackFailures.length > 0)
        ) {
          const error = squashAtomCommandFailure(result.failure);
          const failedEnvironment = result.failedMember.environmentLabel;
          toastManager.add(
            stackedThreadToast({
              type: "error",
              title: `Could not update ${group.displayName}`,
              description:
                result.rollbackFailures.length > 0
                  ? "Some grouped checkouts could not be restored. Retry this setting to align them."
                  : `${
                      error instanceof Error ? error.message : "The project was not updated."
                    }${failedEnvironment ? ` (${failedEnvironment})` : ""} Earlier changes were rolled back.`,
            }),
          );
        }
      } finally {
        savingRef.current = false;
        setSavingProjectKey(null);
      }
    },
    [updateProject],
  );

  if (groups.length === 0) return null;

  return (
    <SettingsSection id="project-new-thread-workspace" title="Project new-thread workspace">
      {groups.map((group) => {
        const groupedMode = resolveGroupedProjectWorkspaceMode(group.memberProjects);
        const isSaving = savingProjectKey !== null;
        const modeLabel =
          groupedMode === "inherit"
            ? "Use default"
            : groupedMode === "mixed"
              ? "Mixed settings"
              : resolveEnvModeLabel(groupedMode);
        return (
          <SettingsRow
            key={group.projectKey}
            title={
              <span className="inline-flex min-w-0 items-center gap-2">
                <ProjectFavicon
                  project={{ ...group, title: group.displayName }}
                  className="size-4 shrink-0"
                />
                <span className="truncate">{group.displayName}</span>
              </span>
            }
            description={
              groupedMode === "mixed"
                ? "Grouped checkouts currently use different defaults. Pick one to align them."
                : `Overrides t3.json and the global default for ${
                    group.groupedProjectCount === 1
                      ? "this project"
                      : `all ${group.groupedProjectCount} grouped checkouts`
                  }.`
            }
            resetAction={
              groupedMode !== "inherit" ? (
                <SettingResetButton
                  label={`${group.displayName} workspace`}
                  onClick={() => void updateGroupMode(group, null)}
                />
              ) : null
            }
            control={
              <Select
                value={groupedMode}
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
                  <SelectValue>{modeLabel}</SelectValue>
                </SelectTrigger>
                <SelectPopup align="end" alignItemWithTrigger={false}>
                  {groupedMode === "mixed" ? (
                    <SelectItem disabled hideIndicator value="mixed">
                      Mixed settings
                    </SelectItem>
                  ) : null}
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
