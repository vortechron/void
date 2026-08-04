import { CircleAlertIcon, MessageSquareIcon, TriangleAlertIcon } from "lucide-react";

import type { SidebarV2Status } from "../Sidebar.logic";
import { Diamond } from "../loading-ui/diamond";

export function ThreadTabStatusIcon({ status }: { readonly status: SidebarV2Status }) {
  switch (status) {
    case "working":
      return (
        <Diamond
          aria-label="Working"
          className="size-3.5 shrink-0 text-sky-600 dark:text-sky-300"
        />
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
    case "ready":
      return null;
  }
}
