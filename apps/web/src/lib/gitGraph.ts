/**
 * Lane assignment for the commit graph, following the layout of the VS Code
 * Git Graph extension (mhutchie/vscode-git-graph) so both draw the same shape.
 *
 * The input is the commit list exactly as `git log --date-order` returned it
 * (newest first). Layout walks branches, not rows: from the first commit that
 * still has an unplaced parent, it follows parents down the list and takes the
 * leftmost free lane on every row it crosses. A line keeps that lane until the
 * row of the commit it points at and only bends there, so a side branch never
 * borrows the lane of the history it is about to merge into.
 *
 * Every segment runs from one row's node to the next row's node. The upper row
 * lists it in `bottomEdges`, the lower row in `topEdges`, and each row draws
 * only its own half.
 */

export interface GitGraphInputCommit {
  readonly sha: string;
  readonly parents: ReadonlyArray<string>;
}

export interface GitGraphEdge {
  /** Lane at the upper row's node. */
  readonly fromLane: number;
  /** Lane at the lower row's node. */
  readonly toLane: number;
  readonly color: number;
}

export interface GitGraphRow {
  readonly sha: string;
  readonly nodeLane: number;
  readonly color: number;
  /** Segments arriving from the row above; this row draws their lower half. */
  readonly topEdges: ReadonlyArray<GitGraphEdge>;
  /** Segments leaving for the row below; this row draws their upper half. */
  readonly bottomEdges: ReadonlyArray<GitGraphEdge>;
  /** Lanes occupied anywhere in this row, used to size the graph column. */
  readonly laneCount: number;
}

export interface GitGraph {
  readonly rows: ReadonlyArray<GitGraphRow>;
  readonly laneCount: number;
}

interface Branch {
  readonly color: number;
}

interface Vertex {
  /** Row index of each parent, or `OUTSIDE` when it is past the loaded page. */
  readonly parents: ReadonlyArray<number>;
  nextParent: number;
  branch: Branch | null;
  lane: number;
  /** Leftmost lane on this row that no line has claimed yet. */
  nextLane: number;
  /** For each claimed lane, the commit its line is heading to and on which branch. */
  readonly connections: Array<{ readonly parent: number; readonly branch: Branch }>;
}

/** A parent that is not in the list; its line runs to the bottom of the graph. */
const OUTSIDE = -1;

const EMPTY_GRAPH: GitGraph = { rows: [], laneCount: 0 };

export function buildGitGraph(commits: ReadonlyArray<GitGraphInputCommit>): GitGraph {
  if (commits.length === 0) return EMPTY_GRAPH;

  const rowBySha = new Map(commits.map((commit, row) => [commit.sha, row]));
  const vertices: Array<Vertex> = commits.map((commit) => ({
    parents: commit.parents.map((sha) => rowBySha.get(sha) ?? OUTSIDE),
    nextParent: 0,
    branch: null,
    lane: 0,
    nextLane: 0,
    connections: [],
  }));
  const topEdges: Array<Array<GitGraphEdge>> = commits.map(() => []);
  const bottomEdges: Array<Array<GitGraphEdge>> = commits.map(() => []);
  /** Row where the last branch of each color stopped, so the color can be reused below it. */
  const colorEnds: Array<number> = [];

  const nextParentOf = (vertex: Vertex): number | null =>
    vertex.nextParent < vertex.parents.length ? vertex.parents[vertex.nextParent]! : null;

  const claimLane = (row: number, lane: number, parent: number, branch: Branch): void => {
    const vertex = vertices[row]!;
    if (lane !== vertex.nextLane) return;
    vertex.connections[lane] = { parent, branch };
    vertex.nextLane = lane + 1;
  };

  const addSegment = (lowerRow: number, fromLane: number, toLane: number, branch: Branch) => {
    const edge = { fromLane, toLane, color: branch.color };
    bottomEdges[lowerRow - 1]!.push(edge);
    topEdges[lowerRow]!.push(edge);
  };

  const takeColor = (startRow: number): number => {
    const free = colorEnds.findIndex((end) => startRow > end);
    if (free !== -1) return free;
    colorEnds.push(0);
    return colorEnds.length - 1;
  };

  /** A merge whose parent is already drawn joins the first line already heading to it. */
  const joinPlacedParent = (startRow: number, parent: number, parentBranch: Branch): void => {
    const vertex = vertices[startRow]!;
    let lastLane = vertex.lane;
    for (let row = startRow + 1; row < vertices.length; row++) {
      const current = vertices[row]!;
      const joinLane = current.connections.findIndex(
        (connection) => connection?.parent === parent && connection.branch === parentBranch,
      );
      const lane = joinLane === -1 ? current.nextLane : joinLane;
      addSegment(row, lastLane, lane, parentBranch);
      claimLane(row, lane, parent, parentBranch);
      lastLane = lane;
      if (joinLane !== -1) break;
    }
    vertex.nextParent++;
  };

  /** Starts a new branch at `startRow` and follows first parents until it meets drawn history. */
  const drawBranch = (startRow: number): void => {
    let vertex = vertices[startRow]!;
    let parent = nextParentOf(vertex);
    let lastLane = vertex.branch ? vertex.lane : vertex.nextLane;
    const branch: Branch = { color: takeColor(startRow) };
    if (!vertex.branch) {
      vertex.branch = branch;
      vertex.lane = lastLane;
    }
    claimLane(startRow, lastLane, startRow, branch);

    let row = startRow + 1;
    for (; parent !== null && row < vertices.length; row++) {
      const current = vertices[row]!;
      const lane = parent === row && current.branch ? current.lane : current.nextLane;
      addSegment(row, lastLane, lane, branch);
      claimLane(row, lane, parent, branch);
      lastLane = lane;
      if (parent !== row) continue;

      vertex.nextParent++;
      const parentWasPlaced = current.branch !== null;
      if (!current.branch) {
        current.branch = branch;
        current.lane = lane;
      }
      vertex = current;
      parent = nextParentOf(vertex);
      if (parent === null || parentWasPlaced) break;
    }
    // The walk ran off the bottom without meeting its parent (it is past the page).
    if (row === vertices.length && parent !== null) vertex.nextParent++;
    colorEnds[branch.color] = row;
  };

  let startRow = 0;
  while (startRow < vertices.length) {
    const vertex = vertices[startRow]!;
    const parent = nextParentOf(vertex);
    if (vertex.branch && parent === null) {
      startRow++;
      continue;
    }
    const parentBranch = parent === null || parent === OUTSIDE ? null : vertices[parent]!.branch;
    if (parent !== null && parentBranch && vertex.branch && vertex.parents.length > 1) {
      joinPlacedParent(startRow, parent, parentBranch);
    } else {
      drawBranch(startRow);
    }
  }

  let maxLaneCount = 0;
  const rows = commits.map<GitGraphRow>((commit, row) => {
    const vertex = vertices[row]!;
    const edges = [...topEdges[row]!, ...bottomEdges[row]!];
    const laneCount = edges.reduce(
      (count, edge) => Math.max(count, edge.fromLane + 1, edge.toLane + 1),
      vertex.lane + 1,
    );
    maxLaneCount = Math.max(maxLaneCount, laneCount);
    return {
      sha: commit.sha,
      nodeLane: vertex.lane,
      color: vertex.branch?.color ?? 0,
      topEdges: topEdges[row]!,
      bottomEdges: bottomEdges[row]!,
      laneCount,
    };
  });

  return { rows, laneCount: maxLaneCount };
}
