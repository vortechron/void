import { useCallback, useMemo } from "react";

import { applyPrivateProjectName, buildPrivateProjectNames } from "../privateProjectNames";
import { useProjects } from "../state/entities";
import { useClientSettings, useClientSettingsHydrated } from "./useSettings";

/**
 * Maps a project label to what the user actually wants on screen.
 *
 * Returns the label unchanged while the setting is off. Projects and client
 * settings ride the same server config stream, so a project label cannot paint
 * before the stored preference has landed.
 */
export function usePrivateProjectName(): (name: string) => string {
  const settingsHydrated = useClientSettingsHydrated();
  const privateProjectNames = useClientSettings((settings) => settings.privateProjectNames);
  const projects = useProjects();
  const masks = useMemo(() => {
    if (!settingsHydrated || !privateProjectNames) return null;
    return buildPrivateProjectNames(
      projects.flatMap((project) => [
        project.title,
        project.repositoryIdentity?.displayName,
        project.repositoryIdentity?.name,
      ]),
    );
  }, [privateProjectNames, projects, settingsHydrated]);

  return useCallback(
    (name: string) => (masks === null ? name : applyPrivateProjectName(masks, name)),
    [masks],
  );
}
