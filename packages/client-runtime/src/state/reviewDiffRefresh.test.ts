import { EnvironmentId, ThreadId, TurnId, type VcsStatusResult } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  getGitDiffRevision,
  shouldRefreshGitDiffPreview,
  type GitDiffRefreshSnapshot,
} from "./reviewDiffRefresh.ts";

const CLEAN_STATUS: VcsStatusResult = {
  isRepo: true,
  hasPrimaryRemote: true,
  isDefaultRef: true,
  refName: "main",
  hasWorkingTreeChanges: false,
  workingTree: { files: [], insertions: 0, deletions: 0 },
  hasUpstream: true,
  aheadCount: 0,
  behindCount: 0,
  aheadOfDefaultCount: 0,
  pr: null,
};

const THREAD_KEY = `${EnvironmentId.make("environment-1")}:${ThreadId.make("thread-1")}`;
const TURN_ID = TurnId.make("turn-1");

function snapshot(
  status: VcsStatusResult,
  overrides: Partial<GitDiffRefreshSnapshot> = {},
): GitDiffRefreshSnapshot {
  return {
    threadKey: THREAD_KEY,
    turnId: TURN_ID,
    gitRevision: getGitDiffRevision(status),
    hasWorkingTreeChanges: status.hasWorkingTreeChanges,
    ...overrides,
  };
}

describe("Git diff preview refresh", () => {
  it("refreshes when an active turn makes the previously clean working tree dirty", () => {
    const dirtyStatus: VcsStatusResult = {
      ...CLEAN_STATUS,
      hasWorkingTreeChanges: true,
      workingTree: {
        files: [{ path: "src/campaign.ts", insertions: 750, deletions: 26 }],
        insertions: 750,
        deletions: 26,
      },
    };

    expect(shouldRefreshGitDiffPreview(snapshot(CLEAN_STATUS), snapshot(dirtyStatus))).toBe(true);
  });

  it("refreshes an initially dirty checkout once the status snapshot resolves", () => {
    const dirtyStatus: VcsStatusResult = {
      ...CLEAN_STATUS,
      hasWorkingTreeChanges: true,
      workingTree: {
        files: [{ path: "src/campaign.ts", insertions: 1, deletions: 0 }],
        insertions: 1,
        deletions: 0,
      },
    };

    expect(shouldRefreshGitDiffPreview(null, snapshot(dirtyStatus))).toBe(true);
  });

  it("does not refresh again for the same Git and turn snapshot", () => {
    const current = snapshot(CLEAN_STATUS);
    expect(shouldRefreshGitDiffPreview(current, current)).toBe(false);
  });

  it("keeps refreshing when a turn completes without a Git status change", () => {
    expect(
      shouldRefreshGitDiffPreview(
        snapshot(CLEAN_STATUS),
        snapshot(CLEAN_STATUS, { turnId: TurnId.make("turn-2") }),
      ),
    ).toBe(true);
  });
});
