import { useCallback, useLayoutEffect, useRef, useState } from "react";

import { readEffectiveZoom } from "~/effectiveZoom";
import { resolveHighlightGeometry } from "./glidingHighlightGeometry";

/* ─────────────────────────────────────────────────────────
 * GLIDING HIGHLIGHT
 *
 * One highlight slides between rows instead of each row
 * toggling its own background, so moving down a menu reads
 * as a single object travelling rather than a set of lights
 * blinking on and off.
 *
 * The pointer drives it; the active row is where it rests.
 * Measurement is layout-effect so the pill never paints a
 * frame at the wrong offset.
 * ───────────────────────────────────────────────────────── */

export type HighlightBox = {
  top: number;
  height: number;
  /** Omitted for flat lists, where the pill spans the container. */
  left?: number;
  width?: number;
};

/**
 * Delegated variant, for lists the caller does not render row by row — a tree
 * with nested groups, drag handles and virtualised children.
 *
 * Rows are found by selector from the pointer target instead of by ref, so
 * nothing has to be threaded through the row components and no ref collides
 * with an existing drag activator.
 *
 * The offset is measured in the container's scrolled coordinate space, so an
 * absolutely positioned pill inside it stays on its row while the list scrolls.
 */
export function useDelegatedGlidingHighlight(rowSelector: string) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<HighlightBox | null>(null);

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      const container = containerRef.current;
      if (!container) return;
      const target = event.target instanceof Element ? event.target : null;
      const row = target?.closest(rowSelector);
      if (!(row instanceof HTMLElement) || !container.contains(row)) {
        setBox(null);
        return;
      }
      const geometry = resolveHighlightGeometry(
        container.getBoundingClientRect(),
        row.getBoundingClientRect(),
        readEffectiveZoom(container),
      );
      setBox({
        // `scrollTop` is already an unzoomed layout offset, so it is added
        // after the measured rects have been scaled back.
        top: geometry.top + container.scrollTop,
        height: geometry.height,
        // Tracked because rows in a tree are indented by depth; a full-width
        // pill would sit under the indent instead of around the row.
        left: geometry.left,
        width: geometry.width,
      });
    },
    [rowSelector],
  );

  return {
    box,
    containerProps: {
      ref: containerRef,
      onPointerMove: handlePointerMove,
      onPointerLeave: () => setBox(null),
    },
  };
}

export function useGlidingHighlight(restKey: string | null) {
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Record<string, HTMLElement | null>>({});
  const [hovered, setHovered] = useState<string | null>(null);
  const [box, setBox] = useState<HighlightBox | null>(null);

  const registerItem = useCallback(
    (key: string) => (node: HTMLElement | null) => {
      itemRefs.current[key] = node;
    },
    [],
  );

  const target = hovered ?? restKey;

  useLayoutEffect(() => {
    const container = containerRef.current;
    const element = target === null ? null : itemRefs.current[target];
    if (!container || !element) {
      setBox(null);
      return;
    }
    const geometry = resolveHighlightGeometry(
      container.getBoundingClientRect(),
      element.getBoundingClientRect(),
      readEffectiveZoom(container),
    );
    setBox({
      top: geometry.top,
      height: geometry.height,
    });
  }, [target]);

  return {
    containerRef,
    registerItem,
    box,
    /** Spread onto each row. */
    itemProps: (key: string) => ({
      ref: registerItem(key),
      onPointerEnter: () => setHovered(key),
    }),
    /** Spread onto the container so the pill returns to rest. */
    containerProps: {
      ref: containerRef,
      onPointerLeave: () => setHovered(null),
    },
  };
}
