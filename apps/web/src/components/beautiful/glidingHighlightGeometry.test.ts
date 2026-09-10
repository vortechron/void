import { describe, expect, it } from "vite-plus/test";

import { resolveHighlightGeometry } from "./glidingHighlightGeometry";

const containerRect = { top: 100, left: 40, width: 200, height: 400 };

describe("gliding highlight geometry", () => {
  it("keeps measured offsets as-is at default zoom", () => {
    expect(
      resolveHighlightGeometry(containerRect, { top: 260, left: 48, width: 184, height: 32 }, 1),
    ).toEqual({ top: 160, left: 8, width: 184, height: 32 });
  });

  it("returns the list's own pixels when the app is zoomed out", () => {
    // The same row at 80%: the browser reports 0.8x of every layout value, and
    // will scale the pill's own offsets by 0.8 again when it paints them.
    const geometry = resolveHighlightGeometry(
      containerRect,
      { top: 228, left: 46.4, width: 147.2, height: 25.6 },
      0.8,
    );

    expect(geometry.top).toBeCloseTo(160);
    expect(geometry.left).toBeCloseTo(8);
    expect(geometry.width).toBeCloseTo(184);
    expect(geometry.height).toBeCloseTo(32);
  });

  it("returns the list's own pixels when the app is zoomed in", () => {
    expect(
      resolveHighlightGeometry(containerRect, { top: 300, left: 50, width: 230, height: 40 }, 1.25),
    ).toEqual({ top: 160, left: 8, width: 184, height: 32 });
  });

  it("falls back to unscaled offsets when the zoom is unusable", () => {
    const elementRect = { top: 260, left: 48, width: 184, height: 32 };
    const expected = { top: 160, left: 8, width: 184, height: 32 };

    expect(resolveHighlightGeometry(containerRect, elementRect, 0)).toEqual(expected);
    expect(resolveHighlightGeometry(containerRect, elementRect, Number.NaN)).toEqual(expected);
  });
});
