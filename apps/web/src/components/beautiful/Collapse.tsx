import { type ReactNode, useEffect, useState } from "react";

/* ─────────────────────────────────────────────────────────
 * COLLAPSE
 *
 * The expand animation from the Beautiful UI thinking and
 * tool-chip primitives: a grid row travelling 0fr → 1fr.
 *
 * This animates to the content's natural height without
 * measuring it first, so a body that is still streaming in
 * grows smoothly instead of jumping when its height changes.
 * The child must be able to overflow-clip, hence the wrapper.
 *
 * `lazy` mounts the children only while open, plus the close
 * animation, so content that loads on mount (tool output, a
 * diff) costs nothing while the row stays collapsed.
 * ───────────────────────────────────────────────────────── */

export function Collapse({
  open,
  children,
  durationMs = 300,
  className = "",
  lazy = false,
}: {
  open: boolean;
  children: ReactNode;
  durationMs?: number;
  className?: string;
  lazy?: boolean;
}) {
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true);

  useEffect(() => {
    if (!lazy || open || !mounted) return;
    const timeout = window.setTimeout(() => setMounted(false), durationMs);
    return () => window.clearTimeout(timeout);
  }, [durationMs, lazy, mounted, open]);

  return (
    <div
      className={`grid transition-[grid-template-rows,opacity] motion-reduce:!transition-none ${className}`}
      style={{
        gridTemplateRows: open ? "1fr" : "0fr",
        opacity: open ? 1 : 0,
        transitionDuration: `${durationMs}ms`,
        transitionTimingFunction: "cubic-bezier(0.23, 1, 0.32, 1)",
      }}
    >
      <div className="min-h-0 overflow-hidden">{!lazy || mounted ? children : null}</div>
    </div>
  );
}
