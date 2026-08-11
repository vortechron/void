import type { ThreadEnvMode } from "@t3tools/contracts";

export type GroupedProjectWorkspaceMode = ThreadEnvMode | "inherit" | "mixed";

export function resolveGroupedProjectWorkspaceMode(
  members: ReadonlyArray<{
    readonly defaultThreadEnvMode?: ThreadEnvMode | null | undefined;
  }>,
): GroupedProjectWorkspaceMode {
  const modes = new Set(members.map((member) => member.defaultThreadEnvMode ?? "inherit"));
  if (modes.size !== 1) return "mixed";
  return modes.values().next().value ?? "inherit";
}

type WriteResult<Failure> =
  | { readonly _tag: "Success" }
  | { readonly _tag: "Failure"; readonly failure: Failure };

export type GroupedProjectWorkspaceUpdateResult<Member, Failure> =
  | { readonly _tag: "Success" }
  | {
      readonly _tag: "Failure";
      readonly failedMember: Member;
      readonly failure: Failure;
      readonly rollbackFailures: ReadonlyArray<{
        readonly member: Member;
        readonly failure: Failure;
      }>;
    };

/**
 * Update every physical member of a grouped project. If a later write fails,
 * restore the members already changed so one logical project does not silently
 * keep different defaults across checkouts.
 */
export async function updateGroupedProjectWorkspaceMode<Member, Failure>(input: {
  readonly members: ReadonlyArray<Member>;
  readonly nextMode: ThreadEnvMode | null;
  readonly currentMode: (member: Member) => ThreadEnvMode | null;
  readonly write: (member: Member, mode: ThreadEnvMode | null) => Promise<WriteResult<Failure>>;
}): Promise<GroupedProjectWorkspaceUpdateResult<Member, Failure>> {
  const updated: Member[] = [];

  for (const member of input.members) {
    if (input.currentMode(member) === input.nextMode) continue;

    const result = await input.write(member, input.nextMode);
    if (result._tag === "Success") {
      updated.push(member);
      continue;
    }

    const rollbackFailures: Array<{ member: Member; failure: Failure }> = [];
    for (const updatedMember of updated.toReversed()) {
      const rollback = await input.write(updatedMember, input.currentMode(updatedMember));
      if (rollback._tag === "Failure") {
        rollbackFailures.push({ member: updatedMember, failure: rollback.failure });
      }
    }

    return {
      _tag: "Failure",
      failedMember: member,
      failure: result.failure,
      rollbackFailures,
    };
  }

  return { _tag: "Success" };
}
