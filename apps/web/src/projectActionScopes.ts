import type { ProjectActionScope } from "@t3tools/contracts";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
  type AtomCommandResult,
} from "@t3tools/client-runtime/state/runtime";

/**
 * Where an edited action started and where it should end up. `from !== to`
 * means the save also moves it between the project row and settings.json.
 */
export interface ProjectActionScopeChange {
  readonly from: ProjectActionScope;
  readonly to: ProjectActionScope;
}

/** Add or replace an entry in one scope's list, matched by id. */
export function upsertById<T extends { readonly id: string }>(
  items: ReadonlyArray<T>,
  next: T,
): ReadonlyArray<T> {
  return items.some((item) => item.id === next.id)
    ? items.map((item) => (item.id === next.id ? next : item))
    : [...items, next];
}

/**
 * Move one action between the project and global stores.
 *
 * The destination is written first so a failure part-way leaves a duplicate the
 * user can delete rather than a hole where the action used to be. That is the
 * documented contract, so every way the removal can fall short — a real error
 * or an interrupted command — has to reach `reportOrphan`; a silent
 * interruption would close the dialog as a clean move while both copies live.
 *
 * The keybinding is deliberately not part of either write. Folding it in would
 * let a keybinding failure abort the removal and strand the duplicate without
 * saying so.
 */
export async function moveProjectAction(input: {
  readonly name: string;
  readonly writeDestination: () => Promise<AtomCommandResult<void, unknown>>;
  readonly removeSource: () => Promise<AtomCommandResult<void, unknown>>;
  readonly reportOrphan: (input: { title: string; description: string }) => void;
}): Promise<AtomCommandResult<void, unknown>> {
  const writeResult = await input.writeDestination();
  if (writeResult._tag === "Failure") {
    return writeResult;
  }

  const removeResult = await input.removeSource();
  if (removeResult._tag === "Failure") {
    input.reportOrphan({
      title: `Copied "${input.name}" but could not remove the original`,
      description: orphanDescription(removeResult),
    });
  }
  return writeResult;
}

type FailedCommand = Extract<AtomCommandResult<void, unknown>, { readonly _tag: "Failure" }>;

function orphanDescription(result: FailedCommand): string {
  if (isAtomCommandInterrupted(result)) {
    return "The removal was interrupted. Delete whichever copy you do not want.";
  }
  const error = squashAtomCommandFailure(result);
  return error instanceof Error ? error.message : "An unexpected error occurred.";
}
