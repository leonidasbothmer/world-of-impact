import type { MindMapEdge, MindMapNode, NodeType } from "@/types/mindmap";
import type { OrbitNodeBox, OrbitPoint } from "@/lib/orbit-layout";

/** Left-to-right stages of the problem flow. */
export const PROBLEM_FLOW_TYPES = [
  "problem",
  "solution",
  "organization",
  "person",
] as const satisfies readonly NodeType[];

const RANK: Record<(typeof PROBLEM_FLOW_TYPES)[number], number> = {
  problem: 0,
  solution: 1,
  organization: 2,
  person: 3,
};

/** Solution clusters sit between a node and its problem; don't wander forever. */
const MAX_SAME_RANK = 3;
const MAX_BACK_DEPTH = 6;
const COLUMN_GAP = 72;
const ROW_GAP = 32;

export type FlowColumnLabel = {
  type: NodeType;
  /** Flow-space point at the top center of the column. */
  x: number;
  y: number;
};

function rankOf(type: NodeType | undefined): number | undefined {
  if (!type || !(type in RANK)) return undefined;
  return RANK[type as keyof typeof RANK];
}

function adjacency(
  nodes: { id: string }[],
  edges: Pick<MindMapEdge, "source" | "target">[],
): Map<string, string[]> {
  const known = new Set(nodes.map((node) => node.id));
  const adjacent = new Map<string, string[]>();
  for (const id of known) adjacent.set(id, []);
  for (const edge of edges) {
    if (!known.has(edge.source) || !known.has(edge.target)) continue;
    adjacent.get(edge.source)?.push(edge.target);
    adjacent.get(edge.target)?.push(edge.source);
  }
  return adjacent;
}

/**
 * Nodes that tell this focal node's story: the shortest walk back to a
 * problem, then forward from the focal node through organization to person.
 *
 * Edges are undirected. Only problem, solution, organization, and person
 * take part. Same-rank steps are allowed on the way back so a solution can
 * cross a few sibling solutions to reach its problem. Farther problems are
 * left out — the flow is the nearest one.
 */
export function problemFlowMemberIds(
  nodes: MindMapNode[],
  edges: Pick<MindMapEdge, "source" | "target">[],
  focusId: string,
): Set<string> {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const focus = byId.get(focusId);
  const included = new Set<string>();
  if (!focus) return included;
  if (rankOf(focus.type) === undefined) {
    included.add(focusId);
    return included;
  }

  const adjacent = adjacency(nodes, edges);
  type Step = { id: string; parents: string[]; depth: number; streak: number };
  const seen = new Map<string, Step>();
  const queue: Step[] = [{ id: focusId, parents: [], depth: 0, streak: 0 }];
  seen.set(focusId, queue[0]);

  while (queue.length > 0) {
    const step = queue.shift();
    if (!step) break;
    const node = byId.get(step.id);
    const rank = rankOf(node?.type);
    if (!node || rank === undefined) continue;
    if (node.type === "problem" || step.depth >= MAX_BACK_DEPTH) continue;

    for (const nextId of adjacent.get(step.id) ?? []) {
      const nextRank = rankOf(byId.get(nextId)?.type);
      if (nextRank === undefined || nextRank > rank) continue;
      const streak = nextRank === rank ? step.streak + 1 : 0;
      if (nextRank === rank && streak > MAX_SAME_RANK) continue;
      const depth = step.depth + 1;
      const existing = seen.get(nextId);
      if (existing) {
        if (existing.depth === depth) existing.parents.push(step.id);
        continue;
      }
      const child: Step = {
        id: nextId,
        parents: [step.id],
        depth,
        streak,
      };
      seen.set(nextId, child);
      queue.push(child);
    }
  }

  let nearest = Infinity;
  for (const step of seen.values()) {
    if (byId.get(step.id)?.type !== "problem") continue;
    nearest = Math.min(nearest, step.depth);
  }
  if (Number.isFinite(nearest)) {
    const stack = [...seen.values()]
      .filter(
        (step) =>
          byId.get(step.id)?.type === "problem" && step.depth === nearest,
      )
      .map((step) => step.id);
    const walked = new Set<string>();
    while (stack.length > 0) {
      const id = stack.pop();
      if (!id || walked.has(id)) continue;
      walked.add(id);
      included.add(id);
      for (const parent of seen.get(id)?.parents ?? []) stack.push(parent);
    }
  }
  included.add(focusId);

  const forward: string[] = [focusId];
  const expanded = new Set<string>();
  while (forward.length > 0) {
    const id = forward.shift();
    if (!id || expanded.has(id)) continue;
    expanded.add(id);
    const rank = rankOf(byId.get(id)?.type);
    if (rank === undefined) continue;
    for (const nextId of adjacent.get(id) ?? []) {
      const nextRank = rankOf(byId.get(nextId)?.type);
      if (nextRank === undefined || nextRank <= rank) continue;
      if (included.has(nextId)) continue;
      included.add(nextId);
      forward.push(nextId);
    }
  }

  return included;
}

function columnOrder(
  boxes: OrbitNodeBox[],
  focusId: string,
  names: ReadonlyMap<string, string>,
): OrbitNodeBox[] {
  const rest = boxes
    .filter((box) => box.id !== focusId)
    .sort((a, b) =>
      (names.get(a.id) ?? a.id).localeCompare(names.get(b.id) ?? b.id),
    );
  const focus = boxes.find((box) => box.id === focusId);
  if (!focus) return rest;
  const mid = Math.floor(rest.length / 2);
  return [...rest.slice(0, mid), focus, ...rest.slice(mid)];
}

/**
 * Top-left positions. Columns run problem → person, centered on `origin`,
 * with the focal node in the middle of its column.
 */
export function problemFlowPositions(
  origin: OrbitPoint,
  boxes: OrbitNodeBox[],
  typeById: ReadonlyMap<string, NodeType>,
  names: ReadonlyMap<string, string>,
  focusId: string,
): { positions: Map<string, OrbitPoint>; columns: FlowColumnLabel[] } {
  const positions = new Map<string, OrbitPoint>();
  const grouped = PROBLEM_FLOW_TYPES.map((type) => ({
    type,
    boxes: columnOrder(
      boxes.filter((box) => typeById.get(box.id) === type),
      focusId,
      names,
    ),
  })).filter((column) => column.boxes.length > 0);

  if (grouped.length === 0) return { positions, columns: [] };

  const widths = grouped.map((column) =>
    Math.max(...column.boxes.map((box) => box.width), 96),
  );
  const totalWidth =
    widths.reduce((sum, width) => sum + width, 0) +
    COLUMN_GAP * Math.max(0, grouped.length - 1);
  let left = origin.x - totalWidth / 2;
  const columns: FlowColumnLabel[] = [];

  grouped.forEach((column, index) => {
    const width = widths[index] ?? 96;
    const centerX = left + width / 2;
    const totalHeight =
      column.boxes.reduce((sum, box) => sum + box.height, 0) +
      ROW_GAP * Math.max(0, column.boxes.length - 1);
    let top = origin.y - totalHeight / 2;
    let highest = top;
    for (const box of column.boxes) {
      positions.set(box.id, {
        x: centerX - box.width / 2,
        y: top,
      });
      highest = Math.min(highest, top);
      top += box.height + ROW_GAP;
    }
    columns.push({ type: column.type, x: centerX, y: highest });
    left += width + COLUMN_GAP;
  });

  return { positions, columns };
}
