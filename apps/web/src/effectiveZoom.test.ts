import { describe, expect, it } from "vite-plus/test";

import { readEffectiveZoom, readLayoutHeight } from "./effectiveZoom";

/** Minimal stand-in for the three reads the zoom helpers make. */
function element(input: {
  renderedHeight: number;
  layoutHeight: number;
  currentCSSZoom?: number;
}): HTMLElement {
  return {
    currentCSSZoom: input.currentCSSZoom,
    offsetHeight: input.layoutHeight,
    getBoundingClientRect: () => ({ height: input.renderedHeight }) as DOMRect,
  } as unknown as HTMLElement;
}

describe("readEffectiveZoom", () => {
  it("prefers the browser's own report", () => {
    expect(
      readEffectiveZoom(element({ renderedHeight: 80, layoutHeight: 100, currentCSSZoom: 0.8 })),
    ).toBe(0.8);
  });

  it("derives the factor from rendered over layout height", () => {
    expect(readEffectiveZoom(element({ renderedHeight: 80, layoutHeight: 100 }))).toBe(0.8);
  });

  it("falls back to 1 for a collapsed element", () => {
    expect(readEffectiveZoom(element({ renderedHeight: 0, layoutHeight: 0 }))).toBe(1);
  });
});

describe("readLayoutHeight", () => {
  it("returns the layout height a zoomed element reserves", () => {
    // The bug this guards: 212px of composer reserved only 169.5px of
    // timeline, so the end of the last answer sat under the chat box.
    expect(
      readLayoutHeight(element({ renderedHeight: 169.6, layoutHeight: 212, currentCSSZoom: 0.8 })),
    ).toBeCloseTo(212, 6);
  });

  it("leaves an unzoomed element untouched", () => {
    expect(
      readLayoutHeight(element({ renderedHeight: 212, layoutHeight: 212, currentCSSZoom: 1 })),
    ).toBe(212);
  });

  it("stays finite when the element has no height to measure", () => {
    expect(readLayoutHeight(element({ renderedHeight: 0, layoutHeight: 0 }))).toBe(0);
  });
});
