import type { ReactNode } from "react";

/* ─────────────────────────────────────────────────────────
 * SHIMMER — a travelling highlight for "work in progress"
 * labels. The text is its own mask, so the sweep rides the
 * glyphs rather than a block behind them.
 *
 * Reduced motion falls back to the plain muted label.
 * ───────────────────────────────────────────────────────── */

export function Shimmer({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={`bg-clip-text text-transparent motion-reduce:bg-none motion-reduce:text-muted-foreground ${className}`}
      style={{
        backgroundImage:
          "linear-gradient(90deg, var(--muted-foreground) 35%, var(--foreground) 50%, var(--muted-foreground) 65%)",
        backgroundSize: "200% 100%",
        animation: "shimmer-text 1.4s linear infinite",
      }}
    >
      {children}
    </span>
  );
}
