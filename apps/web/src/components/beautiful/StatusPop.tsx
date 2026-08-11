import type { ReactNode } from "react";

/* ─────────────────────────────────────────────────────────
 * STATUS POP
 *
 * The settle animation from the Beautiful UI task rows: a
 * status mark scales up as it lands rather than appearing
 * fully formed. Used when a tool call resolves, so the eye
 * is drawn to the row that just changed.
 *
 * `both` fill keeps the mark visible after the run, and
 * reduced motion drops straight to the settled state.
 * ───────────────────────────────────────────────────────── */

export function StatusPop({ children }: { children: ReactNode }) {
  return (
    <span
      className="inline-flex items-center justify-center motion-reduce:!animate-none"
      style={{ animation: "pop-in 300ms cubic-bezier(0.23,1,0.32,1) both" }}
    >
      {children}
    </span>
  );
}
