import type { MindMapEdge } from "@/types/mindmap";

export type NodeHighlight = "neighbor" | "path" | "endpoint";
export type EdgeHighlight = "neighbor" | "path";

export function neighborIds(
  selectedId: string | null,
  edges: MindMapEdge[],
): Set<string> {
  const neighbors = new Set<string>();
  if (!selectedId) return neighbors;
  for (const edge of edges) {
    if (edge.source === selectedId) neighbors.add(edge.target);
    else if (edge.target === selectedId) neighbors.add(edge.source);
  }
  return neighbors;
}

export function edgeEndpointIds(
  selectedEdgeId: string | null,
  edges: { id: string; source: string; target: string }[],
): Set<string> {
  const endpoints = new Set<string>();
  if (!selectedEdgeId) return endpoints;
  const edge = edges.find((item) => item.id === selectedEdgeId);
  if (!edge) return endpoints;
  endpoints.add(edge.source);
  endpoints.add(edge.target);
  return endpoints;
}

export function nodeHighlight(
  id: string,
  selectedId: string | null,
  neighbors: Set<string>,
  endpoints?: ReadonlySet<string>,
): NodeHighlight | undefined {
  if (endpoints?.has(id)) return "endpoint";
  if (!selectedId || id === selectedId) return undefined;
  return neighbors.has(id) ? "neighbor" : undefined;
}

export function edgeHighlight(
  source: string,
  target: string,
  selectedId: string | null,
): EdgeHighlight | undefined {
  if (!selectedId) return undefined;
  if (source === selectedId || target === selectedId) return "neighbor";
  return undefined;
}

export function nodeZIndex(
  selected: boolean,
  highlight?: NodeHighlight,
): number {
  if (selected) return 10;
  if (highlight === "endpoint" || highlight === "path") return 9;
  if (highlight === "neighbor") return 8;
  return 0;
}
