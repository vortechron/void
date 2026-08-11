/* ─────────────────────────────────────────────────────────
 * CHOICE INDICATOR
 *
 * The radio / checkbox mark from the Beautiful UI approval
 * primitive. Split out so the real pending-question panel in
 * the composer can use it against live approval state.
 *
 * Empty is a 1.5px inset ring; selected fills with ink and
 * scales the dot (radio) or reveals the tick (checkbox), so
 * the transition reads as one motion rather than a swap.
 * ───────────────────────────────────────────────────────── */

export function ChoiceIndicator({
  selected,
  multiSelect = false,
  className = "",
}: {
  selected: boolean;
  multiSelect?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={`flex size-4 shrink-0 items-center justify-center transition-colors duration-200 ${
        multiSelect ? "rounded-[5px]" : "rounded-full"
      } ${
        selected
          ? "bg-primary text-primary-foreground"
          : "text-transparent shadow-[inset_0_0_0_1.5px_var(--input)]"
      } ${className}`}
    >
      {multiSelect ? (
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M20 6L9 17l-5-5" />
        </svg>
      ) : (
        <span
          className="size-1.5 rounded-full bg-current transition-transform duration-200"
          style={{ transform: selected ? "scale(1)" : "scale(0)" }}
        />
      )}
    </span>
  );
}
