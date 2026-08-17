import { describe, expect, it } from "vite-plus/test";

import { DIFF_FILE_TREE_MIN_WIDTH, getDiffFileTreeMaxWidth } from "./diffFileTreeResize";

describe("getDiffFileTreeMaxWidth", () => {
  it("leaves room for code in a normal diff panel", () => {
    expect(getDiffFileTreeMaxWidth(540)).toBe(324);
  });

  it("caps the tree on a wide diff panel", () => {
    expect(getDiffFileTreeMaxWidth(1_200)).toBe(480);
  });

  it("never shrinks below the usable tree width", () => {
    expect(getDiffFileTreeMaxWidth(200)).toBe(DIFF_FILE_TREE_MIN_WIDTH);
  });

  it("uses the default panel width before measurement", () => {
    expect(getDiffFileTreeMaxWidth(null)).toBe(324);
    expect(getDiffFileTreeMaxWidth(Number.NaN)).toBe(324);
  });
});
