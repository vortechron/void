/* ─────────────────────────────────────────────────────────
 * GLIDING HIGHLIGHT GEOMETRY
 *
 * `getBoundingClientRect` reports pixels after CSS zoom, but the pill is
 * positioned inside the same zoomed box, where the browser scales those
 * numbers a second time. Interface zoom therefore drags the pill away from
 * the row under the pointer, and further away the lower the row sits.
 * Dividing the measurements back out puts the pill in the list's own
 * coordinate space, which is what the pill's `top` and `height` are read in.
 * ───────────────────────────────────────────────────────── */

type Measured = {
  readonly top: number;
  readonly left: number;
  readonly width: number;
  readonly height: number;
};

export type UnscaledBox = {
  readonly top: number;
  readonly left: number;
  readonly width: number;
  readonly height: number;
};

/**
 * Offsets of `element` inside `container`, in the container's own unzoomed
 * pixels. Both rects must come from `getBoundingClientRect`.
 */
export function resolveHighlightGeometry(
  containerRect: Measured,
  elementRect: Measured,
  zoom: number,
): UnscaledBox {
  const scale = zoom > 0 && Number.isFinite(zoom) ? zoom : 1;
  return {
    top: (elementRect.top - containerRect.top) / scale,
    left: (elementRect.left - containerRect.left) / scale,
    width: elementRect.width / scale,
    height: elementRect.height / scale,
  };
}
