import type { HighlightBox } from "./useGlidingHighlight";

/**
 * The travelling pill itself. Sits behind the rows, so it must be rendered
 * inside a `relative` container before them. Reduced motion drops the travel
 * and lets it cut straight to the new row.
 */
export function GlidingHighlight({
  box,
  className = "bg-accent",
}: {
  box: HighlightBox | null;
  className?: string;
}) {
  const tracksWidth = box?.width !== undefined;

  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute rounded-md motion-reduce:!transition-none ${
        tracksWidth ? "" : "inset-x-0"
      } ${className}`}
      style={{
        top: box?.top ?? 0,
        height: box?.height ?? 0,
        ...(tracksWidth ? { left: box?.left ?? 0, width: box?.width ?? 0 } : {}),
        opacity: box ? 1 : 0,
        transition:
          "top 220ms cubic-bezier(0.23,1,0.32,1), height 220ms cubic-bezier(0.23,1,0.32,1), left 220ms cubic-bezier(0.23,1,0.32,1), width 220ms cubic-bezier(0.23,1,0.32,1), opacity 150ms ease",
      }}
    />
  );
}
