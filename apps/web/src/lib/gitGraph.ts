/**
 * Lane assignment for the commit graph.
 *
 * The input is the commit list exactly as `git log --date-order` returned it
 * (newest first). Each row gets a node lane plus the line segments that cross
 * it, so the renderer only has to map lane indices to x positions and draw.
 *
 * Lanes are never compacted mid-list: a lane keeps its column for as long as it
 * is waiting for a commit, which is what keeps a branch reading as one straight
 * line instead of drifting sideways every few rows.
 */

export interface GitGraphInputCommit {
  readonly sha: string;
  readonly parents: ReadonlyArray<string>;
}

export interface GitGraphEdge {
  /** Lane index at the start of the segment. */
  readonly fromLane: number;
  /** Lane index at the end of the segment. */
  readonly toLane: number;
  readonly color: number;
}

export interface GitGraphRow {
  readonly sha: string;
  readonly nodeLane: number;
  readonly color: number;
  /** Segments in the upper half of the row, ending at the node's y midpoint. */
  readonly topEdges: ReadonlyArray<GitGraphEdge>;
  /** Segments in the lower half of the row, starting at the node's y midpoint. */
  readonly bottomEdges: ReadonlyArray<GitGraphEdge>;
  /** Lanes occupied anywhere in this row, used to size the graph column. */
  readonly laneCount: number;
}

export interface GitGraph {
  readonly rows: ReadonlyArray<GitGraphRow>;
  readonly laneCount: number;
}

interface Lane {
  readonly sha: string;
  readonly color: number;
}

export const GIT_GRAPH_LANE_COLORS = 8;

const EMPTY_GRAPH: GitGraph = { rows: [], laneCount: 0 };

function findFreeLane(lanes: ReadonlyArray<Lane | null>): number {
  const free = lanes.indexOf(null);
  return free === -1 ? lanes.length : free;
}

function placeLane(lanes: Array<Lane | null>, index: number, lane: Lane | null): void {
  while (lanes.length <= index) lanes.push(null);
  lanes[index] = lane;
}

export function buildGitGraph(commits: ReadonlyArray<GitGraphInputCommit>): GitGraph {
  if (commits.length === 0) return EMPTY_GRAPH;

  const lanes: Array<Lane | null> = [];
  const rows: Array<GitGraphRow> = [];
  let nextColor = 0;
  let maxLaneCount = 0;

  for (const commit of commits) {
    const matches: Array<number> = [];
    for (const [index, lane] of lanes.entries()) {
      if (lane?.sha === commit.sha) matches.push(index);
    }

    const nodeLane = matches[0] ?? findFreeLane(lanes);
    const color =
      matches[0] === undefined ? nextColor++ % GIT_GRAPH_LANE_COLORS : lanes[nodeLane]!.color;

    const topEdges: Array<GitGraphEdge> = [];
    for (const [index, lane] of lanes.entries()) {
      if (!lane) continue;
      if (lane.sha === commit.sha) {
        topEdges.push({ fromLane: index, toLane: nodeLane, color: lane.color });
      } else {
        topEdges.push({ fromLane: index, toLane: index, color: lane.color });
      }
    }

    // Every lane that was waiting for this commit is now resolved by it.
    for (const index of matches) placeLane(lanes, index, null);
    placeLane(lanes, nodeLane, null);

    const bottomEdges: Array<GitGraphEdge> = [];
    for (const [index, parent] of commit.parents.entries()) {
      const existing = lanes.findIndex((lane) => lane?.sha === parent);
      if (existing !== -1) {
        // Two branches reach the same parent: draw into the lane that already
        // owns it instead of opening a duplicate column for the same history.
        bottomEdges.push({ fromLane: nodeLane, toLane: existing, color: lanes[existing]!.color });
        continue;
      }
      const targetLane = index === 0 && lanes[nodeLane] == null ? nodeLane : findFreeLane(lanes);
      const targetColor = index === 0 ? color : nextColor++ % GIT_GRAPH_LANE_COLORS;
      placeLane(lanes, targetLane, { sha: parent, color: targetColor });
      bottomEdges.push({ fromLane: nodeLane, toLane: targetLane, color: targetColor });
    }

    for (const [index, lane] of lanes.entries()) {
      if (!lane) continue;
      const claimed = bottomEdges.some((edge) => edge.toLane === index);
      if (!claimed) bottomEdges.push({ fromLane: index, toLane: index, color: lane.color });
    }

    while (lanes.length > 0 && lanes.at(-1) == null) lanes.pop();

    const laneCount = Math.max(
      nodeLane + 1,
      lanes.length,
      ...topEdges.map((edge) => Math.max(edge.fromLane, edge.toLane) + 1),
      ...bottomEdges.map((edge) => Math.max(edge.fromLane, edge.toLane) + 1),
    );
    maxLaneCount = Math.max(maxLaneCount, laneCount);

    rows.push({ sha: commit.sha, nodeLane, color, topEdges, bottomEdges, laneCount });
  }

  return { rows, laneCount: maxLaneCount };
}
