import type { SidebarThreadSummary } from "~/types";
import { workspaceSessionKey } from "~/workspaceSessions";

import {
  resolveThreadAttentionStatus,
  type ThreadAttentionStatus,
} from "../sidebarWorkspaceStatus";

/**
 * Attention status for every chat of a project, keyed the way the sidebar tabs and
 * the chat history menu key their sessions. Closing a tab only hides the chat,
 * so a failed or blocked chat has to stay readable from the history menu —
 * otherwise the sidebar's workspace warning points at nothing the user can find.
 */
export function resolveSessionStatusesByKey(input: {
  readonly threads: readonly SidebarThreadSummary[];
  readonly lastVisitedAtByThreadKey: Readonly<Record<string, string>>;
}): ReadonlyMap<string, ThreadAttentionStatus> {
  return new Map(
    input.threads.map((thread) => {
      const key = workspaceSessionKey({
        environmentId: thread.environmentId,
        threadId: thread.id,
      });
      return [
        key,
        resolveThreadAttentionStatus({
          ...thread,
          lastVisitedAt: input.lastVisitedAtByThreadKey[key],
        }),
      ] as const;
    }),
  );
}
