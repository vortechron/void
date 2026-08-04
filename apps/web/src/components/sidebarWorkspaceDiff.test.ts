import { describe, expect, it } from "vite-plus/test";

import { resolveSidebarWorkspaceDiffStat } from "./sidebarWorkspaceDiff";

describe("resolveSidebarWorkspaceDiffStat", () => {
  it("reports changes for either the original checkout or a worktree", () => {
    expect(
      resolveSidebarWorkspaceDiffStat({ workingTree: { insertions: 64, deletions: 18 } }),
    ).toEqual({ additions: 64, deletions: 18 });
  });

  it("stays quiet for a clean checkout", () => {
    expect(
      resolveSidebarWorkspaceDiffStat({ workingTree: { insertions: 0, deletions: 0 } }),
    ).toBeNull();
  });

  it("stays quiet before git status lands", () => {
    expect(resolveSidebarWorkspaceDiffStat({ workingTree: null })).toBeNull();
    expect(resolveSidebarWorkspaceDiffStat({ workingTree: undefined })).toBeNull();
  });
});
