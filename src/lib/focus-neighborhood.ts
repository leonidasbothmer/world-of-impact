import type { MindMapEdge, MindMapNode } from "@/types/mindmap";

/**
 * Nodes within `hops` of any focus root (undirected), plus their edges.
 * Empty focusRoots means the full graph.
 */
export function focusNeighborhoodIds(
  nodes: MindMapNode[],
  edges: MindMapEdge[],
  focusRoots: readonly string[],
  hops = 2,
): Set<string> | null {
  if (focusRoots.length === 0) return null;

  const nodeIds = new Set(nodes.map((n) => n.id));
  const roots = focusRoots.filter((id) => nodeIds.has(id));
  if (roots.length === 0) return null;

  const adjacent = new Map<string, string[]>();
  for (const id of nodeIds) adjacent.set(id, []);
  for (const edge of edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) continue;
    adjacent.get(edge.source)?.push(edge.target);
    adjacent.get(edge.target)?.push(edge.source);
  }

  const reached = new Set<string>(roots);
  let frontier = [...roots];
  for (let depth = 0; depth < hops; depth++) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const neighbor of adjacent.get(id) ?? []) {
        if (reached.has(neighbor)) continue;
        reached.add(neighbor);
        next.push(neighbor);
      }
    }
    frontier = next;
  }
  return reached;
}
