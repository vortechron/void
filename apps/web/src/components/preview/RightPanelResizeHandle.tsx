import { PanelResizeGrip } from "~/components/ui/panel-resize-grip";
import type { ResizableWidthHandlers } from "~/hooks/useResizableWidth";
import { cn } from "~/lib/utils";

interface Props {
  handlers: ResizableWidthHandlers;
  className?: string;
}

/**
 * Hit target for resizing a right-anchored panel via its left edge.
 *
 * - Sits on top of the panel's border with a 4px overlap on each side so the
 *   user can grab a few pixels off the edge without aiming. Touch pointers get
 *   the wider `PanelResizeGrip` tab instead, since a finger cannot land on 8px.
 * - `touch-none` is required: without it Safari claims the gesture as a pan and
 *   cancels the drag part way through.
 * - Visual indicator is a 1px line that lights up on hover/active to mirror
 *   VS Code / Cursor.
 */
export function RightPanelResizeHandle({ handlers, className }: Props) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      className={cn(
        "group/resize absolute inset-y-0 -left-1 z-20 w-2 touch-none cursor-col-resize select-none",
        className,
      )}
      {...handlers}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-transparent transition-colors duration-150 group-hover/resize:bg-border group-active/resize:bg-primary/60"
      />
      <PanelResizeGrip />
    </div>
  );
}
