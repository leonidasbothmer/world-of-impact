import type { MindMapEdge, MindMapNode, NodeType } from "@/types/mindmap";

const STORAGE_KEY = "impact-mindmap-hidden-types";
/** Set once so an older "show everything" preference picks up this default. */
const DEFAULT_APPLIED_KEY = "impact-mindmap-hidden-types-default-v2";

/** Categories hidden until the visitor turns them on. */
export const DEFAULT_HIDDEN_TYPES: readonly NodeType[] = ["academic", "media"];

function defaultHiddenTypes(valid: readonly NodeType[]): NodeType[] {
  const allowed = new Set<string>(valid);
  return DEFAULT_HIDDEN_TYPES.filter((type) => allowed.has(type));
}

function readStoredHiddenTypes(valid: readonly NodeType[]): NodeType[] | null {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) return null;
  const allowed = new Set<string>(valid);
  return parsed.filter(
    (value): value is NodeType =>
      typeof value === "string" && allowed.has(value),
  );
}

export function loadHiddenTypes(valid: readonly NodeType[]): NodeType[] {
  const fallback = defaultHiddenTypes(valid);
  if (typeof window === "undefined") return fallback;
  try {
    const stored = readStoredHiddenTypes(valid);
    if (window.localStorage.getItem(DEFAULT_APPLIED_KEY) !== "1") {
      window.localStorage.setItem(DEFAULT_APPLIED_KEY, "1");
      const next = new Set(stored ?? []);
      for (const type of fallback) next.add(type);
      return [...next];
    }
    return stored ?? fallback;
  } catch {
    return fallback;
  }
}

export function saveHiddenTypes(hidden: readonly NodeType[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(hidden));
}

/**
 * Nodes to draw for the current category filter.
 *
 * Hidden categories drop out. A person also drops out when they have no path
 * to a still-visible non-person node — including through other people. A
 * person with no links at all stays. The selected node stays so search can
 * open something whose category is off.
 */
export function visibleNodeIds(
  nodes: MindMapNode[],
  edges: MindMapEdge[],
  hiddenTypes: ReadonlySet<NodeType>,
  alwaysVisibleId?: string | null,
): Set<string> {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const degree = new Map<string, number>();
  for (const node of nodes) degree.set(node.id, 0);
  for (const edge of edges) {
    if (!byId.has(edge.source) || !byId.has(edge.target)) continue;
    degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
    degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
  }

  const candidateIds = new Set<string>();
  for (const node of nodes) {
    const hidden =
      (hiddenTypes?.has(node.type) ?? false) && node.id !== alwaysVisibleId;
    if (!hidden) candidateIds.add(node.id);
  }

  const adjacent = new Map<string, string[]>();
  for (const id of candidateIds) adjacent.set(id, []);
  for (const edge of edges) {
    if (!candidateIds.has(edge.source) || !candidateIds.has(edge.target)) continue;
    adjacent.get(edge.source)?.push(edge.target);
    adjacent.get(edge.target)?.push(edge.source);
  }

  const anchored = new Set<string>();
  for (const id of candidateIds) {
    const node = byId.get(id);
    if (node && node.type !== "person") anchored.add(id);
  }

  const reached = new Set<string>(anchored);
  const queue = [...anchored];
  while (queue.length > 0) {
    const id = queue.pop();
    if (!id) continue;
    for (const next of adjacent.get(id) ?? []) {
      if (reached.has(next)) continue;
      reached.add(next);
      queue.push(next);
    }
  }

  const visible = new Set<string>();
  for (const id of candidateIds) {
    const node = byId.get(id);
    if (!node) continue;
    if (node.type !== "person") {
      visible.add(id);
      continue;
    }
    if (id === alwaysVisibleId || (degree.get(id) ?? 0) === 0 || reached.has(id)) {
      visible.add(id);
    }
  }
  return visible;
}
