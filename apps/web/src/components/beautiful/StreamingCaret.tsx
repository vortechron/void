/* ─────────────────────────────────────────────────────────
 * STREAMING CARET
 *
 * The block cursor from the Beautiful UI streaming-text
 * primitive, marking the live end of an answer that is still
 * arriving. Fades in so it does not pop when a turn starts,
 * and blinks once the text pauses.
 *
 * Rendered next to the message body rather than inside the
 * markdown tree, so it survives re-renders as tokens land.
 * ───────────────────────────────────────────────────────── */

export function StreamingCaret({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden
      data-testid="streaming-caret"
      className={`ml-0.5 inline-block h-3.5 w-0.5 translate-y-0.5 rounded-full bg-foreground align-baseline ${className}`}
      style={{
        animation: "fade-in 150ms ease-out both, caret-blink 1.1s steps(1) 400ms infinite",
      }}
    />
  );
}
