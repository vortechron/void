import { describe, expect, it } from "vite-plus/test";

import { buildGitGraph } from "./gitGraph";

describe("buildGitGraph", () => {
  it("returns an empty graph for no commits", () => {
    expect(buildGitGraph([])).toEqual({ rows: [], laneCount: 0 });
  });

  it("keeps linear history in a single lane", () => {
    const graph = buildGitGraph([
      { sha: "c", parents: ["b"] },
      { sha: "b", parents: ["a"] },
      { sha: "a", parents: [] },
    ]);

    expect(graph.laneCount).toBe(1);
    expect(graph.rows.map((row) => row.nodeLane)).toEqual([0, 0, 0]);
    expect(new Set(graph.rows.map((row) => row.color)).size).toBe(1);
  });

  it("draws the tip row with no incoming line and the root row with no outgoing line", () => {
    const graph = buildGitGraph([
      { sha: "b", parents: ["a"] },
      { sha: "a", parents: [] },
    ]);

    expect(graph.rows[0]?.topEdges).toEqual([]);
    expect(graph.rows[0]?.bottomEdges).toEqual([{ fromLane: 0, toLane: 0, color: 0 }]);
    expect(graph.rows[1]?.topEdges).toEqual([{ fromLane: 0, toLane: 0, color: 0 }]);
    expect(graph.rows[1]?.bottomEdges).toEqual([]);
  });

  it("opens a second lane for a merge and closes it at the shared ancestor", () => {
    // m merges the side branch s back into the trunk at t; both reach root a.
    const graph = buildGitGraph([
      { sha: "m", parents: ["t", "s"] },
      { sha: "t", parents: ["a"] },
      { sha: "s", parents: ["a"] },
      { sha: "a", parents: [] },
    ]);

    expect(graph.laneCount).toBe(2);
    expect(graph.rows.map((row) => row.nodeLane)).toEqual([0, 0, 1, 0]);

    const side = graph.rows[2]!;
    expect(graph.rows[0]?.bottomEdges).toEqual([
      { fromLane: 0, toLane: 0, color: 0 },
      { fromLane: 0, toLane: 1, color: side.color },
    ]);
    // The trunk keeps running through the side branch's row while the side
    // branch bends into the root in its own color.
    expect(side.bottomEdges).toEqual([
      { fromLane: 0, toLane: 0, color: 0 },
      { fromLane: 1, toLane: 0, color: side.color },
    ]);
  });

  it("keeps a merge's line in its own lane until the row of the parent it points at", () => {
    // Uncommitted changes sit on HEAD (main), and origin/main is a merge of a
    // feature branch into that same main. Git Graph gives the merge's line to
    // main its own lane and puts the feature commits one lane further out,
    // instead of folding the merge line into the uncommitted lane straight away.
    const graph = buildGitGraph([
      { sha: "pending", parents: ["main"] },
      { sha: "merge", parents: ["main", "feature-2"] },
      { sha: "feature-2", parents: ["feature-1"] },
      { sha: "feature-1", parents: ["main"] },
      { sha: "main", parents: ["base"] },
      { sha: "base", parents: [] },
    ]);

    expect(graph.rows.map((row) => row.nodeLane)).toEqual([0, 1, 2, 2, 0, 0]);
    expect(graph.laneCount).toBe(3);

    const mergeColor = graph.rows[1]!.color;
    const featureColor = graph.rows[2]!.color;
    expect(graph.rows[2]?.topEdges).toContainEqual({ fromLane: 1, toLane: 1, color: mergeColor });
    expect(graph.rows[3]?.bottomEdges).toEqual([
      { fromLane: 0, toLane: 0, color: 0 },
      { fromLane: 1, toLane: 0, color: mergeColor },
      { fromLane: 2, toLane: 0, color: featureColor },
    ]);
  });

  it("joins a merge into a line already heading to its parent", () => {
    // x's line is already running down lane 0 toward b when merge m needs b.
    const graph = buildGitGraph([
      { sha: "x", parents: ["b"] },
      { sha: "m", parents: ["y", "b"] },
      { sha: "y", parents: [] },
      { sha: "b", parents: [] },
    ]);

    expect(graph.rows.map((row) => row.nodeLane)).toEqual([0, 1, 1, 0]);
    expect(graph.laneCount).toBe(2);
    expect(graph.rows[1]?.bottomEdges).toContainEqual({
      fromLane: 1,
      toLane: 0,
      color: graph.rows[0]!.color,
    });
  });

  it("reuses a color once the branch that held it has ended", () => {
    const graph = buildGitGraph([
      { sha: "m2", parents: ["b", "s2"] },
      { sha: "s2", parents: ["b"] },
      { sha: "b", parents: ["m1"] },
      { sha: "m1", parents: ["a", "s1"] },
      { sha: "s1", parents: ["a"] },
      { sha: "a", parents: [] },
    ]);

    expect(graph.rows[4]?.nodeLane).toBe(1);
    expect(graph.rows[4]?.color).toBe(graph.rows[1]?.color);
    expect(graph.rows[4]?.color).not.toBe(graph.rows[0]?.color);
  });

  it("gives an unrelated tip a new color", () => {
    const graph = buildGitGraph([
      { sha: "x", parents: [] },
      { sha: "y", parents: [] },
    ]);

    expect(graph.rows.map((row) => row.nodeLane)).toEqual([0, 0]);
    expect(graph.rows[0]?.color).not.toBe(graph.rows[1]?.color);
  });

  it("keeps an unrelated lane running straight past an intervening commit", () => {
    const graph = buildGitGraph([
      { sha: "b", parents: ["a"] },
      { sha: "z", parents: [] },
      { sha: "a", parents: [] },
    ]);

    const middle = graph.rows[1]!;
    expect(middle.nodeLane).toBe(1);
    expect(middle.topEdges).toContainEqual({ fromLane: 0, toLane: 0, color: graph.rows[0]!.color });
    expect(middle.bottomEdges).toContainEqual({
      fromLane: 0,
      toLane: 0,
      color: graph.rows[0]!.color,
    });
  });

  it("runs a line past the last row when its parent is not loaded", () => {
    const graph = buildGitGraph([
      { sha: "a", parents: ["not-loaded"] },
      { sha: "b", parents: [] },
    ]);

    expect(graph.rows[1]?.nodeLane).toBe(1);
    expect(graph.rows[1]?.topEdges).toEqual([{ fromLane: 0, toLane: 0, color: 0 }]);
  });

  it("reports the widest row as the graph lane count", () => {
    const graph = buildGitGraph([
      { sha: "m", parents: ["t", "s"] },
      { sha: "t", parents: ["a"] },
      { sha: "s", parents: ["a"] },
      { sha: "a", parents: [] },
    ]);

    expect(graph.laneCount).toBe(Math.max(...graph.rows.map((row) => row.laneCount)));
  });
});
