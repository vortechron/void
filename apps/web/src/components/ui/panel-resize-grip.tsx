import { GripVerticalIcon } from "lucide-react";

import { cn } from "~/lib/utils";

/**
 * Visible pull tab centred on a vertical panel divider.
 *
 * Render it inside the element that owns the drag handlers. Pointer events stay
 * enabled so the tab widens the divider's hit target — the events bubble up and
 * the divider still sees itself as `currentTarget`. The `after` pseudo-element
 * pads that target out to 44px square without making the tab itself look chunky.
 *
 * Mouse users only get the tab on hover, so a quiet divider stays quiet. Coarse
 * pointers keep it on screen permanently: there is no hover to reveal it with,
 * and a 1px line is not something a finger can aim at.
 */
export function PanelResizeGrip({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "-translate-x-1/2 -translate-y-1/2 absolute top-1/2 left-1/2 z-10 flex h-10 w-4 items-center justify-center rounded-full border border-border bg-background text-icon-muted opacity-0 shadow-sm transition-opacity duration-150",
        "after:-translate-x-1/2 after:-translate-y-1/2 after:absolute after:top-1/2 after:left-1/2 after:size-11 after:content-['']",
        "group-hover/resize:opacity-100 group-focus-visible/resize:opacity-100 group-active/resize:opacity-100 pointer-coarse:opacity-100",
        className,
      )}
      data-slot="panel-resize-grip"
    >
      <GripVerticalIcon aria-hidden className="size-3 shrink-0" />
    </span>
  );
}
