import { MessageSquareTextIcon } from "lucide-react";

import { ThreadTabStatusIcon } from "~/components/chat/ThreadTabStatusIcon";
import type { ThreadAttentionStatus } from "~/components/sidebarWorkspaceStatus";

/** A chat's status icon, with the plain chat glyph as the resting state so
    every row keeps the same shape and titles line up. */
export function SidebarChatStatusIcon({ status }: { readonly status: ThreadAttentionStatus }) {
  if (status === "ready") {
    return <MessageSquareTextIcon className="size-3.5 shrink-0 opacity-55" />;
  }
  return (
    <span className="flex size-3.5 shrink-0 items-center justify-center">
      <ThreadTabStatusIcon status={status} />
    </span>
  );
}
