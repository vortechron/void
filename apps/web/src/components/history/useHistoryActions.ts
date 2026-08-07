/**
 * Runs a commit-graph action and turns its outcome into a toast.
 *
 * The server answers with three shapes — done, refused, or conflicted and rolled
 * back — and only the first is a success. Keeping that mapping here means every
 * menu entry reports the same way, and the panel never has to know that a
 * refusal is not an error.
 */
import type { EnvironmentId, VcsHistoryAction } from "@t3tools/contracts";
import { useCallback, useState } from "react";

import { toastManager } from "~/components/ui/toast";
import { useAtomCommand } from "~/state/use-atom-command";
import { vcsEnvironment } from "~/state/vcs";

/** Long enough to read a list of conflicting paths before it goes. */
const PROBLEM_TOAST_MS = 10_000;

function conflictTitle(source: string, rolledBack: boolean): string {
  return rolledBack
    ? `The ${source} conflicted and was undone`
    : `The ${source} conflicted and could not be undone`;
}

function describePaths(paths: ReadonlyArray<string>): string | undefined {
  if (paths.length === 0) return undefined;
  const shown = paths.slice(0, 5).join(", ");
  const rest = paths.length - 5;
  return rest > 0 ? `${shown} and ${rest} more` : shown;
}

export function useHistoryActions({
  environmentId,
  cwd,
  onCompleted,
}: {
  environmentId: EnvironmentId;
  cwd: string;
  onCompleted: () => void;
}) {
  const [isRunning, setIsRunning] = useState(false);
  const runAction = useAtomCommand(vcsEnvironment.runHistoryAction, { reportFailure: false });

  const run = useCallback(
    async (action: VcsHistoryAction) => {
      setIsRunning(true);
      try {
        const outcome = await runAction({ environmentId, input: { cwd, action } });

        if (outcome._tag !== "Success") {
          toastManager.add({
            type: "error",
            title: "Git command failed",
            description: outcome._tag === "Failure" ? String(outcome.cause) : undefined,
            timeout: PROBLEM_TOAST_MS,
          });
          return;
        }

        const result = outcome.value;
        if (result._tag === "ok") {
          toastManager.add({ type: "success", title: result.detail });
        } else if (result._tag === "blocked") {
          toastManager.add({
            type: "warning",
            title: "Git refused that",
            description: result.detail,
            timeout: PROBLEM_TOAST_MS,
          });
        } else {
          toastManager.add({
            type: result.rolledBack ? "warning" : "error",
            title: conflictTitle(result.source, result.rolledBack),
            description: describePaths(result.paths),
            timeout: PROBLEM_TOAST_MS,
          });
        }
      } finally {
        // The graph is refreshed even on failure: a multi-step action can have
        // landed its first step before the one that failed.
        setIsRunning(false);
        onCompleted();
      }
    },
    [cwd, environmentId, onCompleted, runAction],
  );

  return { run, isRunning };
}
