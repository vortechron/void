/**
 * Draws one row of the commit graph.
 *
 * Each row owns a fixed-height SVG: incoming lines run from the row's top edge
 * to the node's midpoint, outgoing lines from the midpoint to the bottom edge.
 * Rendering per row (rather than one tall SVG) keeps the list virtualizable and
 * means a row repaint never touches its neighbours.
 */
import type { GitGraphRow } from "~/lib/gitGraph";

export const GRAPH_LANE_WIDTH = 14;
export const GRAPH_ROW_HEIGHT = 26;
const NODE_RADIUS = 3.5;

/**
 * Tailwind 500-weight hues: readable against both the light and dark panel
 * backgrounds without needing a per-theme palette.
 */
const LANE_COLORS = [
  "#3b82f6",
  "#ec4899",
  "#22c55e",
  "#f59e0b",
  "#a855f7",
  "#06b6d4",
  "#ef4444",
  "#84cc16",
] as const;

export function laneColor(color: number): string {
  return LANE_COLORS[color % LANE_COLORS.length]!;
}

function laneX(lane: number): number {
  return lane * GRAPH_LANE_WIDTH + GRAPH_LANE_WIDTH / 2;
}

/**
 * How far the curve's control points reach from each node, as in Git Graph: a
 * line leaves and enters a node straight up and down and bends across the row
 * boundary.
 */
const CURVE_DEPTH = GRAPH_ROW_HEIGHT * 0.8;

/**
 * One half of the node-to-node curve, split exactly at the row boundary so the
 * halves drawn by neighbouring rows meet without a kink. `upper` is the half in
 * the row that owns the segment's upper node.
 */
function edgePath(fromLane: number, toLane: number, half: "upper" | "lower"): string {
  const x1 = laneX(fromLane);
  const x2 = laneX(toLane);
  const midY = GRAPH_ROW_HEIGHT / 2;
  if (x1 === x2) {
    return half === "upper"
      ? `M ${x1} ${midY} L ${x1} ${GRAPH_ROW_HEIGHT}`
      : `M ${x2} 0 L ${x2} ${midY}`;
  }
  const boundaryX = (x1 + x2) / 2;
  if (half === "upper") {
    return `M ${x1} ${midY} C ${x1} ${midY + CURVE_DEPTH / 2}, ${(3 * x1 + x2) / 4} ${midY + (CURVE_DEPTH + GRAPH_ROW_HEIGHT) / 4}, ${boundaryX} ${GRAPH_ROW_HEIGHT}`;
  }
  return `M ${boundaryX} 0 C ${(x1 + 3 * x2) / 4} ${(GRAPH_ROW_HEIGHT - CURVE_DEPTH) / 4}, ${x2} ${(GRAPH_ROW_HEIGHT - CURVE_DEPTH) / 2}, ${x2} ${midY}`;
}

export function GitGraphColumn({
  row,
  laneCount,
  variant,
}: {
  row: GitGraphRow;
  laneCount: number;
  /** `pending` is the uncommitted-changes node; `head` is the checked-out commit. */
  variant: "commit" | "head" | "pending";
}) {
  const width = Math.max(laneCount, 1) * GRAPH_LANE_WIDTH;
  const midY = GRAPH_ROW_HEIGHT / 2;
  const color = laneColor(row.color);

  return (
    <svg
      aria-hidden
      className="shrink-0"
      width={width}
      height={GRAPH_ROW_HEIGHT}
      viewBox={`0 0 ${width} ${GRAPH_ROW_HEIGHT}`}
    >
      {row.topEdges.map((edge) => (
        <path
          key={`top:${edge.fromLane}:${edge.toLane}`}
          d={edgePath(edge.fromLane, edge.toLane, "lower")}
          stroke={laneColor(edge.color)}
          strokeWidth={1.5}
          fill="none"
        />
      ))}
      {row.bottomEdges.map((edge) => (
        <path
          key={`bottom:${edge.fromLane}:${edge.toLane}`}
          d={edgePath(edge.fromLane, edge.toLane, "upper")}
          stroke={laneColor(edge.color)}
          strokeWidth={1.5}
          fill="none"
        />
      ))}
      <circle
        cx={laneX(row.nodeLane)}
        cy={midY}
        r={NODE_RADIUS}
        fill={variant === "commit" ? color : "var(--color-background)"}
        stroke={color}
        strokeWidth={variant === "pending" ? 1.5 : 2}
        {...(variant === "pending" ? { strokeDasharray: "2 1.5" } : {})}
      />
    </svg>
  );
}
