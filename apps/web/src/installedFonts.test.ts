import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  __resetInstalledFontCacheForTests,
  loadInstalledFontFamilies,
  normalizeInstalledFontFamilies,
  supportsInstalledFontAccess,
} from "./installedFonts";

describe("installed fonts", () => {
  afterEach(() => {
    __resetInstalledFontCacheForTests();
    vi.unstubAllGlobals();
  });

  it("returns one searchable entry per installed family", () => {
    expect(
      normalizeInstalledFontFamilies([
        { family: "  Zed Mono " },
        { family: "Atkinson Hyperlegible" },
        { family: "zed mono" },
        { family: "" },
        { family: "a".repeat(257) },
      ]),
    ).toEqual(["Atkinson Hyperlegible", "Zed Mono"]);
  });

  it("queries the browser once and shares the normalized family list", async () => {
    const queryLocalFonts = vi.fn(async () => [
      { family: "Berkeley Mono" },
      { family: "Berkeley Mono" },
    ]);
    vi.stubGlobal("window", { queryLocalFonts });

    expect(supportsInstalledFontAccess()).toBe(true);
    await expect(
      Promise.all([loadInstalledFontFamilies(), loadInstalledFontFamilies()]),
    ).resolves.toEqual([["Berkeley Mono"], ["Berkeley Mono"]]);
    expect(queryLocalFonts).toHaveBeenCalledOnce();
  });
});
