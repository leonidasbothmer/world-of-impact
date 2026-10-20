import type { MindMapEdge, MindMapNode, NodeType } from "@/types/mindmap";
import type { OrbitNodeBox, OrbitPoint } from "@/lib/orbit-layout";

/** Left-to-right stages of the problem flow. Solutions repeat once per generation. */
export const PROBLEM_FLOW_TYPES = [
  "problem",
  "solution",
  "organization",
  "person",
] as const satisfies readonly NodeType[];

const COLUMN_GAP = 72;
const ROW_GAP = 32;
/** Stop a runaway solution chain from opening endless columns. */
const MAX_SOLUTION_DEPTH = 12;

export type FlowColumnLabel = {
  type: NodeType;
  /** Flow-space point at the top center of the column. */
  x: number;
  y: number;
};

type FlowEdge = Pick<MindMapEdge, "source" | "target">;

function isFlowType(type: NodeType | undefined): type is (typeof PROBLEM_FLOW_TYPES)[number] {
  return (
    type === "problem" ||
    type === "solution" ||
    type === "organization" ||
    type === "person"
  );
}

function adjacency(edges: FlowEdge[]) {
  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();
  const undirected = new Map<string, string[]>();
  const add = (map: Map<string, string[]>, from: string, to: string) => {
    const list = map.get(from);
    if (list) list.push(to);
    else map.set(from, [to]);
  };
  for (const edge of edges) {
    add(outgoing, edge.source, edge.target);
    add(incoming, edge.target, edge.source);
    add(undirected, edge.source, edge.target);
    add(undirected, edge.target, edge.source);
  }
  return { outgoing, incoming, undirected };
}

/**
 * Column rank for the focal node's problem flow.
 *
 * Arrows step away from the problem: problem → solution → child solution.
 * A problem, or a solution linked directly to a problem, opens the whole
 * forest under that problem. A deeper solution opens only its cause chain
 * back to the problem and its own descendants — not siblings or cousins.
 * A solution's column is its longest path from a problem, so a shortcut
 * cannot pull it up into an earlier generation than its other parents.
 * Organizations are one hop from a shown problem or solution. People are one
 * hop from those. Organization-organization and problem-problem links do not
 * pull extra nodes.
 */
export function problemFlowColumns(
  nodes: Pick<MindMapNode, "id" | "type">[],
  edges: FlowEdge[],
  focusId: string,
): Map<string, number> {
  const typeById = new Map(nodes.map((node) => [node.id, node.type]));
  const column = new Map<string, number>();
  const focusType = typeById.get(focusId);
  if (!focusType) return column;
  if (!isFlowType(focusType)) {
    column.set(focusId, 0);
    return column;
  }

  const { outgoing, incoming, undirected } = adjacency(edges);
  const linked = linkedSolutionIds(focusId, focusType, typeById, undirected);
  const opensForest =
    focusType === "problem" ||
    solutionTouchesProblem(focusId, typeById, incoming, outgoing) ||
    linked.some((id) => solutionTouchesProblem(id, typeById, incoming, outgoing));
  const spine = opensForest
    ? null
    : pathSpine(focusId, focusType, typeById, incoming, outgoing, undirected);
  const problems = upstreamProblems(focusId, focusType, typeById, incoming, undirected);
  const depth = new Map<string, number>();
  for (const id of problems) depth.set(id, 0);

  const queue = [...problems];
  const reachedSolutions = new Set<string>();
  while (queue.length > 0) {
    const id = queue.shift();
    if (!id) break;
    const rank = depth.get(id) ?? 0;
    if (rank >= MAX_SOLUTION_DEPTH) continue;
    for (const nextId of outgoing.get(id) ?? []) {
      if (typeById.get(nextId) !== "solution" || depth.has(nextId)) continue;
      if (spine && !spine.has(nextId)) continue;
      depth.set(nextId, rank + 1);
      reachedSolutions.add(nextId);
      queue.push(nextId);
    }
  }

  for (const id of reachedSolutions) depth.delete(id);
  let guard = 0;
  let changed = true;
  while (changed && guard < MAX_SOLUTION_DEPTH) {
    changed = false;
    guard += 1;
    for (const [source, targets] of outgoing) {
      const sourceType = typeById.get(source);
      if (sourceType !== "problem" && sourceType !== "solution") continue;
      if (spine && sourceType === "solution" && !spine.has(source)) continue;
      const sourceRank = depth.get(source);
      if (sourceRank === undefined) continue;
      for (const target of targets) {
        if (typeById.get(target) !== "solution") continue;
        if (spine && !spine.has(target)) continue;
        const next = sourceRank + 1;
        if (next > MAX_SOLUTION_DEPTH) continue;
        const previous = depth.get(target);
        if (previous === undefined || next > previous) {
          depth.set(target, next);
          changed = true;
        }
      }
    }
  }
  const keepRank = spine ?? reachedSolutions;
  for (const id of keepRank) {
    if (typeById.get(id) === "solution" && !depth.has(id)) depth.set(id, 1);
  }

  for (const edge of edges) {
    const sourceType = typeById.get(edge.source);
    const targetType = typeById.get(edge.target);
    if (
      sourceType === "problem" &&
      targetType === "solution" &&
      depth.has(edge.target)
    ) {
      depth.set(edge.source, 0);
    } else if (
      targetType === "problem" &&
      sourceType === "solution" &&
      depth.has(edge.source)
    ) {
      depth.set(edge.target, 0);
    }
  }

  let maxSolution = 0;
  for (const [id, rank] of depth) {
    if (typeById.get(id) === "solution") maxSolution = Math.max(maxSolution, rank);
  }
  const orgRank = maxSolution + 1;
  const personRank = orgRank + 1;

  for (const [id, rank] of depth) column.set(id, rank);

  const story = new Set(depth.keys());
  const orgIds = new Set<string>();
  for (const edge of edges) {
    considerOrg(edge.source, edge.target);
    considerOrg(edge.target, edge.source);
  }
  for (const id of orgIds) column.set(id, orgRank);
  if (!column.has(focusId) && focusType === "organization") {
    column.set(focusId, orgRank);
    orgIds.add(focusId);
  }

  for (const edge of edges) {
    considerPerson(edge.source, edge.target);
    considerPerson(edge.target, edge.source);
  }
  if (!column.has(focusId)) column.set(focusId, focusType === "person" ? personRank : 0);

  return column;

  function considerOrg(id: string, otherId: string) {
    const other = typeById.get(otherId);
    if (
      typeById.get(id) === "organization" &&
      story.has(otherId) &&
      (other === "problem" || other === "solution")
    ) {
      orgIds.add(id);
    }
  }

  function considerPerson(id: string, otherId: string) {
    if (typeById.get(id) !== "person") return;
    const other = typeById.get(otherId);
    const linkedToStory =
      (other === "problem" || other === "solution") && story.has(otherId);
    const linkedToOrg = other === "organization" && orgIds.has(otherId);
    if (linkedToStory || linkedToOrg) column.set(id, personRank);
  }
}

function solutionTouchesProblem(
  id: string,
  typeById: ReadonlyMap<string, NodeType>,
  incoming: Map<string, string[]>,
  outgoing: Map<string, string[]>,
): boolean {
  if (typeById.get(id) !== "solution") return false;
  for (const otherId of [...(incoming.get(id) ?? []), ...(outgoing.get(id) ?? [])]) {
    if (typeById.get(otherId) === "problem") return true;
  }
  return false;
}

function linkedSolutionIds(
  focusId: string,
  focusType: NodeType,
  typeById: ReadonlyMap<string, NodeType>,
  undirected: Map<string, string[]>,
): string[] {
  const seeds = new Set<string>();
  const absorb = (id: string) => {
    for (const nextId of undirected.get(id) ?? []) {
      if (typeById.get(nextId) === "solution") seeds.add(nextId);
    }
  };
  if (focusType === "solution") seeds.add(focusId);
  if (focusType === "organization") absorb(focusId);
  if (focusType === "person") {
    absorb(focusId);
    for (const nextId of undirected.get(focusId) ?? []) {
      if (typeById.get(nextId) === "organization") absorb(nextId);
    }
  }
  return [...seeds];
}

/** Cause chain back to a problem, plus descendants of the focused solutions. */
function pathSpine(
  focusId: string,
  focusType: NodeType,
  typeById: ReadonlyMap<string, NodeType>,
  incoming: Map<string, string[]>,
  outgoing: Map<string, string[]>,
  undirected: Map<string, string[]>,
): Set<string> {
  const spine = new Set<string>();
  const seeds =
    focusType === "solution"
      ? [focusId]
      : linkedSolutionIds(focusId, focusType, typeById, undirected);
  for (const seed of seeds) {
    const up = [seed];
    const seenUp = new Set<string>([seed]);
    spine.add(seed);
    while (up.length > 0) {
      const id = up.shift();
      if (!id) break;
      for (const prevId of incoming.get(id) ?? []) {
        const prevType = typeById.get(prevId);
        if (prevType === "problem") spine.add(prevId);
        else if (prevType === "solution" && !seenUp.has(prevId)) {
          seenUp.add(prevId);
          spine.add(prevId);
          up.push(prevId);
        }
      }
    }
    const down = [seed];
    const seenDown = new Set<string>([seed]);
    let depth = 0;
    while (down.length > 0 && depth < MAX_SOLUTION_DEPTH) {
      const layer = down.splice(0, down.length);
      depth += 1;
      for (const id of layer) {
        for (const nextId of outgoing.get(id) ?? []) {
          if (typeById.get(nextId) !== "solution" || seenDown.has(nextId)) continue;
          seenDown.add(nextId);
          spine.add(nextId);
          down.push(nextId);
        }
      }
    }
  }
  return spine;
}

function upstreamProblems(
  focusId: string,
  focusType: NodeType,
  typeById: ReadonlyMap<string, NodeType>,
  incoming: Map<string, string[]>,
  undirected: Map<string, string[]>,
): Set<string> {
  const problems = new Set<string>();
  if (focusType === "problem") {
    problems.add(focusId);
    return problems;
  }

  const seeds: string[] = [];
  if (focusType === "solution") {
    seeds.push(focusId);
  } else {
    const seenOrgs = new Set<string>();
    for (const nextId of undirected.get(focusId) ?? []) {
      const nextType = typeById.get(nextId);
      if (nextType === "problem") problems.add(nextId);
      else if (nextType === "solution") seeds.push(nextId);
      else if (nextType === "organization" && focusType === "person" && !seenOrgs.has(nextId)) {
        seenOrgs.add(nextId);
        for (const furtherId of undirected.get(nextId) ?? []) {
          const furtherType = typeById.get(furtherId);
          if (furtherType === "problem") problems.add(furtherId);
          else if (furtherType === "solution") seeds.push(furtherId);
        }
      }
    }
  }

  const seen = new Set(seeds);
  const queue = [...seeds];
  while (queue.length > 0) {
    const id = queue.shift();
    if (!id) break;
    for (const prevId of incoming.get(id) ?? []) {
      const prevType = typeById.get(prevId);
      if (prevType === "problem") problems.add(prevId);
      else if (prevType === "solution" && !seen.has(prevId)) {
        seen.add(prevId);
        queue.push(prevId);
      }
    }
  }
  return problems;
}

/**
 * Nodes that stay lit when `selectedId` is chosen inside a problem flow:
 * the cause chain back to a problem, that node's own descendants, and the
 * organizations and people on that forward stretch.
 */
export function problemFlowPathIds(
  nodes: Pick<MindMapNode, "id" | "type">[],
  edges: FlowEdge[],
  selectedId: string,
): Set<string> {
  const typeById = new Map(nodes.map((node) => [node.id, node.type]));
  const selectedType = typeById.get(selectedId);
  const path = new Set<string>();
  if (!selectedType || !isFlowType(selectedType)) {
    path.add(selectedId);
    return path;
  }
  const { outgoing, incoming, undirected } = adjacency(edges);
  const forward = new Set<string>();

  if (selectedType === "problem" || selectedType === "solution") {
    if (selectedType === "solution") {
      const up = [selectedId];
      const seen = new Set<string>([selectedId]);
      while (up.length > 0) {
        const id = up.shift();
        if (!id) break;
        for (const prevId of incoming.get(id) ?? []) {
          const prevType = typeById.get(prevId);
          if (prevType === "problem") path.add(prevId);
          else if (prevType === "solution" && !seen.has(prevId)) {
            seen.add(prevId);
            path.add(prevId);
            up.push(prevId);
          }
        }
      }
    }
    path.add(selectedId);
    forward.add(selectedId);
    const down = [selectedId];
    const seenDown = new Set<string>([selectedId]);
    let depth = 0;
    while (down.length > 0 && depth < MAX_SOLUTION_DEPTH) {
      const layer = down.splice(0, down.length);
      depth += 1;
      for (const id of layer) {
        for (const nextId of outgoing.get(id) ?? []) {
          if (typeById.get(nextId) !== "solution" || seenDown.has(nextId)) continue;
          seenDown.add(nextId);
          path.add(nextId);
          forward.add(nextId);
          down.push(nextId);
        }
      }
    }
  } else {
    path.add(selectedId);
    forward.add(selectedId);
    const seeds = linkedSolutionIds(selectedId, selectedType, typeById, undirected);
    for (const seed of seeds) {
      path.add(seed);
      const up = [seed];
      const seen = new Set<string>([seed]);
      while (up.length > 0) {
        const id = up.shift();
        if (!id) break;
        for (const prevId of incoming.get(id) ?? []) {
          const prevType = typeById.get(prevId);
          if (prevType === "problem") path.add(prevId);
          else if (prevType === "solution" && !seen.has(prevId)) {
            seen.add(prevId);
            path.add(prevId);
            up.push(prevId);
          }
        }
      }
    }
    for (const nextId of undirected.get(selectedId) ?? []) {
      if (typeById.get(nextId) === "problem") path.add(nextId);
    }
  }

  const orgIds = new Set<string>();
  for (const edge of edges) {
    pullOrg(edge.source, edge.target);
    pullOrg(edge.target, edge.source);
  }
  if (selectedType === "organization") orgIds.add(selectedId);
  for (const id of orgIds) path.add(id);
  for (const edge of edges) {
    pullPerson(edge.source, edge.target);
    pullPerson(edge.target, edge.source);
  }
  return path;

  function pullOrg(id: string, otherId: string) {
    const other = typeById.get(otherId);
    if (
      typeById.get(id) === "organization" &&
      forward.has(otherId) &&
      (other === "problem" || other === "solution")
    ) {
      orgIds.add(id);
    }
  }

  function pullPerson(id: string, otherId: string) {
    if (typeById.get(id) !== "person") return;
    const other = typeById.get(otherId);
    if (
      (forward.has(otherId) &&
        (other === "problem" || other === "solution" || other === "organization")) ||
      (other === "organization" && orgIds.has(otherId))
    ) {
      path.add(id);
    }
  }
}

export function problemFlowMemberIds(
  nodes: MindMapNode[],
  edges: FlowEdge[],
  focusId: string,
): Set<string> {
  return new Set(problemFlowColumns(nodes, edges, focusId).keys());
}

function arrangeColumns(
  ranks: number[],
  members: Map<number, string[]>,
  columns: ReadonlyMap<string, number>,
  undirected: Map<string, string[]>,
  names: ReadonlyMap<string, string>,
) {
  const indexOf = (id: string) => {
    const rank = columns.get(id);
    if (rank === undefined) return -1;
    return members.get(rank)?.indexOf(id) ?? -1;
  };
  const barycenter = (id: string) => {
    const own = columns.get(id);
    const neighbors = (undirected.get(id) ?? []).filter((nextId) => {
      const rank = columns.get(nextId);
      return rank !== undefined && rank !== own;
    });
    if (neighbors.length === 0) return null;
    let sum = 0;
    for (const nextId of neighbors) sum += indexOf(nextId);
    return sum / neighbors.length;
  };
  const byName = (a: string, b: string) =>
    (names.get(a) ?? a).localeCompare(names.get(b) ?? b);

  for (const rank of ranks) members.get(rank)?.sort(byName);

  for (let pass = 0; pass < 6; pass++) {
    const order = pass % 2 === 0 ? ranks : [...ranks].reverse();
    for (const rank of order) {
      const list = members.get(rank);
      if (!list) continue;
      list.sort((a, b) => {
        const aBary = barycenter(a);
        const bBary = barycenter(b);
        if (aBary == null && bBary == null) return byName(a, b);
        if (aBary == null) return 1;
        if (bBary == null) return -1;
        if (aBary !== bBary) return aBary - bBary;
        return byName(a, b);
      });
    }
  }
}

/**
 * Top-left positions. Columns run problem, then one column per solution
 * generation, then organizations, then people, centered on `origin`.
 */
export function problemFlowPositions(
  origin: OrbitPoint,
  boxes: OrbitNodeBox[],
  typeById: ReadonlyMap<string, NodeType>,
  names: ReadonlyMap<string, string>,
  focusId: string,
  edges: FlowEdge[],
): {
  positions: Map<string, OrbitPoint>;
  columns: FlowColumnLabel[];
} {
  const positions = new Map<string, OrbitPoint>();
  const nodes = [...typeById].map(([id, type]) => ({ id, type }));
  const ranksById = problemFlowColumns(nodes, edges, focusId);
  const boxById = new Map(boxes.map((box) => [box.id, box]));
  const present = boxes.map((box) => box.id).filter((id) => ranksById.has(id));
  const rankSet = new Set(present.map((id) => ranksById.get(id) ?? 0));
  const ranks = [...rankSet].sort((a, b) => a - b);
  const members = new Map<number, string[]>();
  for (const rank of ranks) members.set(rank, []);
  for (const id of present) members.get(ranksById.get(id) ?? 0)?.push(id);

  const { undirected } = adjacency(edges);
  arrangeColumns(ranks, members, ranksById, undirected, names);

  const grouped = ranks.map((rank) => {
    const ids = members.get(rank) ?? [];
    const type = typeById.get(ids[0] ?? "") ?? "solution";
    return {
      type,
      boxes: ids
        .map((id) => boxById.get(id))
        .filter((box): box is OrbitNodeBox => box != null),
    };
  }).filter((column) => column.boxes.length > 0);

  if (grouped.length === 0) {
    return { positions, columns: [] };
  }

  const widths = grouped.map((column) => {
    const content = Math.max(...column.boxes.map((box) => box.width));
    return Math.max(content, 96);
  });
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
