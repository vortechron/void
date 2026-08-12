import {
  CircleAlertIcon,
  CircleCheckIcon,
  ClipboardCheckIcon,
  EyeIcon,
  MessageSquareIcon,
  TriangleAlertIcon,
} from "lucide-react";

import { PixelGridLoader } from "../beautiful/PixelGridLoader";
import type { ThreadAttentionStatus } from "../sidebarWorkspaceStatus";

export function ThreadTabStatusIcon({ status }: { readonly status: ThreadAttentionStatus }) {
  switch (status) {
    case "working":
      return (
        <span
          role="status"
          aria-label="Working"
          className="flex size-4 shrink-0 items-center justify-center text-sky-600 dark:text-sky-300"
        >
          <PixelGridLoader />
        </span>
      );
    case "approval":
      return (
        <CircleAlertIcon
          role="img"
          aria-label="Approval needed"
          className="size-3.5 shrink-0 text-amber-600 dark:text-amber-300"
        />
      );
    case "input":
      return (
        <MessageSquareIcon
          role="img"
          aria-label="Awaiting input"
          className="size-3.5 shrink-0 text-indigo-600 dark:text-indigo-300"
        />
      );
    case "failed":
      return (
        <TriangleAlertIcon
          role="img"
          aria-label="Failed"
          className="size-3.5 shrink-0 text-red-600 dark:text-red-300"
        />
      );
    case "plan":
      return (
        <ClipboardCheckIcon
          role="img"
          aria-label="Plan ready"
          className="size-3.5 shrink-0 text-violet-600 dark:text-violet-300"
        />
      );
    case "completed":
      return (
        <CircleCheckIcon
          role="img"
          aria-label="Completed"
          className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-300"
        />
      );
    case "monitoring":
      return (
        <EyeIcon
          role="img"
          aria-label="Monitoring"
          className="size-3.5 shrink-0 text-sky-600 dark:text-sky-300"
        />
      );
    case "ready":
      return null;
  }
}
