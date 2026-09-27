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

    const mergeRow = graph.rows[0]!;
    expect(mergeRow.bottomEdges).toEqual([
      { fromLane: 0, toLane: 0, color: mergeRow.color },
      { fromLane: 0, toLane: 1, color: graph.rows[2]!.color },
    ]);

    // The side branch converges on the lane that already owns the root commit,
    // and that lane keeps running through the row instead of stopping at it.
    expect(graph.rows[2]?.bottomEdges).toEqual([
      { fromLane: 1, toLane: 0, color: 0 },
      { fromLane: 0, toLane: 0, color: 0 },
    ]);
    expect(graph.rows[3]?.nodeLane).toBe(0);
  });

  it("keeps a lane unbroken through a row where another branch joins it", () => {
    // s joins the trunk lane that is already waiting for a, two rows below.
    const graph = buildGitGraph([
      { sha: "t", parents: ["a"] },
      { sha: "s", parents: ["a"] },
      { sha: "a", parents: [] },
    ]);

    const joinRow = graph.rows[1]!;
    expect(joinRow.nodeLane).toBe(1);
    expect(joinRow.topEdges).toContainEqual({ fromLane: 0, toLane: 0, color: 0 });
    expect(joinRow.bottomEdges).toContainEqual({ fromLane: 0, toLane: 0, color: 0 });
    expect(joinRow.bottomEdges).toContainEqual({ fromLane: 1, toLane: 0, color: 0 });
  });

  it("reuses a freed lane for an unrelated tip but gives it a new color", () => {
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
