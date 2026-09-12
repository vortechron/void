/**
 * Interface zoom is applied as a CSS `zoom` on the app root, so anything the
 * DOM measures — `getBoundingClientRect`, pointer coordinates — arrives in
 * post-zoom pixels while CSS written back into the zoomed box is read in
 * layout pixels. Dividing measurements by this factor converts them back.
 *
 * `currentCSSZoom` is the direct answer where it exists; elsewhere the
 * rendered height over the layout height reports the same ratio.
 */
export function readEffectiveZoom(element: HTMLElement): number {
  const reported = (element as HTMLElement & { currentCSSZoom?: number }).currentCSSZoom;
  if (typeof reported === "number" && reported > 0) {
    return reported;
  }
  const layoutHeight = element.offsetHeight;
  if (layoutHeight <= 0) {
    return 1;
  }
  const measured = element.getBoundingClientRect().height / layoutHeight;
  return Number.isFinite(measured) && measured > 0 ? measured : 1;
}

/**
 * Border-box height in layout pixels — the space a length written back into
 * the zoomed subtree is read in. Use this instead of `getBoundingClientRect`
 * whenever a measured height becomes a reserved height, a padding, or an
 * inset; the raw rect is short by the zoom factor and reserves too little.
 */
export function readLayoutHeight(element: HTMLElement): number {
  return element.getBoundingClientRect().height / readEffectiveZoom(element);
}
