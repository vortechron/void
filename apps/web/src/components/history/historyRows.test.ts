import * as DateTime from "effect/DateTime";
import type { VcsCommit, VcsCommitRef, VcsListCommitsResult } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  PENDING_ROW_SHA,
  buildHistoryRows,
  buildHistoryView,
  checkoutRefName,
  formatCommitDate,
  sortCommitRefs,
  splitRemoteRefName,
} from "./historyRows";

function commit(overrides: Partial<VcsCommit> & { sha: string }): VcsCommit {
  return {
    shortSha: overrides.sha.slice(0, 8),
    parents: [],
    subject: "wip",
    authorName: "Ada Lovelace",
    authoredAt: DateTime.makeUnsafe("2026-08-06T08:29:00.000Z"),
    refs: [],
    ...overrides,
  };
}

function result(overrides: Partial<VcsListCommitsResult> = {}): VcsListCommitsResult {
  return {
    commits: [],
    isRepo: true,
    headSha: null,
    headRefName: null,
    workingTreeFileCount: 0,
    nextCursor: null,
    ...overrides,
  };
}

describe("buildHistoryRows", () => {
  it("returns no rows without a result", () => {
    expect(buildHistoryRows(null)).toEqual([]);
  });

  it("omits the pending row when the working tree is clean", () => {
    const rows = buildHistoryRows(result({ commits: [commit({ sha: "aaa" })] }));

    expect(rows.map((row) => row.kind)).toEqual(["commit"]);
  });

  it("puts uncommitted changes above the newest commit", () => {
    const rows = buildHistoryRows(
      result({ commits: [commit({ sha: "aaa" })], workingTreeFileCount: 6 }),
    );

    expect(rows[0]).toEqual({ kind: "pending", sha: PENDING_ROW_SHA, fileCount: 6 });
    expect(rows[1]?.kind).toBe("commit");
  });

  it("marks the checked-out commit", () => {
    const rows = buildHistoryRows(
      result({ commits: [commit({ sha: "aaa" }), commit({ sha: "bbb" })], headSha: "bbb" }),
    );

    expect(rows.map((row) => row.kind === "commit" && row.isHead)).toEqual([false, true]);
  });
});

describe("buildHistoryView", () => {
  it("hangs the pending row off HEAD so it shares the current lane", () => {
    const view = buildHistoryView(
      result({
        commits: [commit({ sha: "bbb", parents: ["aaa"] }), commit({ sha: "aaa" })],
        headSha: "bbb",
        workingTreeFileCount: 2,
      }),
    );

    expect(view.graph.rows).toHaveLength(3);
    expect(view.graph.rows.map((row) => row.nodeLane)).toEqual([0, 0, 0]);
    expect(view.graph.laneCount).toBe(1);
  });

  it("leaves the pending row parentless when there is no HEAD yet", () => {
    const view = buildHistoryView(result({ workingTreeFileCount: 1 }));

    expect(view.graph.rows[0]?.bottomEdges).toEqual([]);
  });
});

describe("sortCommitRefs", () => {
  it("puts the current branch first, then locals, remotes, and tags", () => {
    const refs: ReadonlyArray<VcsCommitRef> = [
      { name: "v1.0", kind: "tag", isCurrent: false },
      { name: "origin/main", kind: "remote", isCurrent: false, remoteName: "origin" },
      { name: "feature/advanced", kind: "local", isCurrent: false },
      { name: "main", kind: "local", isCurrent: true },
    ];

    expect(sortCommitRefs(refs).map((ref) => ref.name)).toEqual([
      "main",
      "feature/advanced",
      "origin/main",
      "v1.0",
    ]);
  });
});

describe("splitRemoteRefName", () => {
  it("splits a remote ref into remote and branch", () => {
    expect(
      splitRemoteRefName({
        name: "origin/feature/advanced",
        kind: "remote",
        isCurrent: false,
        remoteName: "origin",
      }),
    ).toEqual({ remote: "origin", branch: "feature/advanced" });
  });

  it("leaves local refs untouched", () => {
    expect(splitRemoteRefName({ name: "main", kind: "local", isCurrent: true })).toEqual({
      remote: null,
      branch: "main",
    });
  });
});

describe("checkoutRefName", () => {
  it("has no checkout target for a detached HEAD badge", () => {
    expect(checkoutRefName({ name: "HEAD", kind: "head", isCurrent: true })).toBeNull();
  });

  it("checks out branches and tags by name", () => {
    expect(checkoutRefName({ name: "main", kind: "local", isCurrent: false })).toBe("main");
    expect(
      checkoutRefName({
        name: "origin/main",
        kind: "remote",
        isCurrent: false,
        remoteName: "origin",
      }),
    ).toBe("origin/main");
  });
});

describe("formatCommitDate", () => {
  it("returns an empty label for an unparsable date", () => {
    expect(formatCommitDate("not-a-date", "24-hour")).toBe("");
  });

  it("renders day, month, year, and time", () => {
    const label = formatCommitDate(new Date("2026-08-06T16:29:00Z"), "24-hour");

    expect(label).toMatch(/2026/);
    expect(label).toMatch(/\d{1,2}:\d{2}/);
  });
});
