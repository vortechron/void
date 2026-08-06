import {
  CircleCheckIcon,
  CircleAlertIcon,
  ClipboardCheckIcon,
  EyeIcon,
  GitBranchIcon,
  MessageSquareIcon,
  TriangleAlertIcon,
  type LucideIcon,
} from "lucide-react";

import { Diamond } from "./loading-ui/diamond";
import type { ThreadAttentionStatus } from "./sidebarWorkspaceStatus";
import { Tooltip, TooltipPopup, TooltipTrigger } from "./ui/tooltip";

const STATUS_PRESENTATION: Record<
  Exclude<ThreadAttentionStatus, "working">,
  {
    readonly label: string;
    readonly Icon: LucideIcon;
    readonly className: string;
  }
> = {
  approval: {
    label: "Approval needed",
    Icon: CircleAlertIcon,
    className: "text-amber-600 dark:text-amber-300",
  },
  input: {
    label: "Awaiting input",
    Icon: MessageSquareIcon,
    className: "text-indigo-600 dark:text-indigo-300",
  },
  failed: {
    label: "Failed",
    Icon: TriangleAlertIcon,
    className: "text-red-600 dark:text-red-300",
  },
  plan: {
    label: "Plan ready",
    Icon: ClipboardCheckIcon,
    className: "text-violet-600 dark:text-violet-300",
  },
  completed: {
    label: "Completed",
    Icon: CircleCheckIcon,
    className: "text-emerald-600 dark:text-emerald-300",
  },
  // Sky, matching the sidebar's Monitoring pill, but static: monitoring is
  // background presence rather than active progress.
  monitoring: {
    label: "Monitoring",
    Icon: EyeIcon,
    className: "text-sky-600 dark:text-sky-300",
  },
  ready: {
    label: "Ready",
    Icon: GitBranchIcon,
    className: "text-muted-foreground/70",
  },
};

export function SidebarWorkspaceStatusIcon({ status }: { readonly status: ThreadAttentionStatus }) {
  if (status === "working") {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <Diamond
              aria-label="Working"
              className="size-3.5 shrink-0 text-sky-600 dark:text-sky-300"
            />
          }
        />
        <TooltipPopup side="top">Working</TooltipPopup>
      </Tooltip>
    );
  }

  const presentation = STATUS_PRESENTATION[status];
  const Icon = presentation.Icon;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            role="img"
            aria-label={presentation.label}
            className="inline-flex size-3.5 shrink-0 items-center justify-center"
          />
        }
      >
        <Icon aria-hidden className={`size-3.5 ${presentation.className}`} />
      </TooltipTrigger>
      <TooltipPopup side="top">{presentation.label}</TooltipPopup>
    </Tooltip>
  );
}
