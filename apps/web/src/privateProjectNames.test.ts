import { describe, expect, it } from "vite-plus/test";

import {
  applyPrivateProjectName,
  buildPrivateProjectNames,
  maskedProjectNameAt,
} from "./privateProjectNames";

describe("buildPrivateProjectNames", () => {
  it("gives every real name its own stand-in", () => {
    const masks = buildPrivateProjectNames(["void", "the-legends", "suamuka"]);

    expect(new Set(masks.values()).size).toBe(3);
    expect([...masks.values()].every((name) => name.startsWith("Project "))).toBe(true);
  });

  it("keeps a project's stand-in stable when the list is reordered or repeated", () => {
    const first = buildPrivateProjectNames(["void", "the-legends", "suamuka"]);
    const second = buildPrivateProjectNames(["suamuka", "void", "void", "the-legends"]);

    expect(second.get("void")).toBe(first.get("void"));
    expect(second.get("the-legends")).toBe(first.get("the-legends"));
  });

  it("skips missing and blank names", () => {
    const masks = buildPrivateProjectNames(["void", null, undefined, "  "]);

    expect([...masks.keys()]).toEqual(["void"]);
  });

  it("stays unique past the end of the word list", () => {
    const names = Array.from(
      { length: 60 },
      (_, index) => `project-${String(index).padStart(2, "0")}`,
    );
    const masks = buildPrivateProjectNames(names);

    expect(new Set(masks.values()).size).toBe(names.length);
  });
});

describe("maskedProjectNameAt", () => {
  it("numbers repeats instead of colliding", () => {
    expect(maskedProjectNameAt(0)).toBe("Project Alpha");
    expect(maskedProjectNameAt(26)).toBe("Project Alpha 2");
    expect(maskedProjectNameAt(52)).toBe("Project Alpha 3");
  });
});

describe("applyPrivateProjectName", () => {
  it("returns the stand-in for a known name", () => {
    const masks = buildPrivateProjectNames(["void"]);

    expect(applyPrivateProjectName(masks, "void")).toBe("Project Alpha");
  });

  it("never falls back to the real name for an unknown one", () => {
    const masks = buildPrivateProjectNames(["void"]);

    expect(applyPrivateProjectName(masks, "secret-client-app")).toBe("Project");
  });
});
