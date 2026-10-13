import type { MindMapNode } from "@/types/mindmap";

const MAX_MATCHES = 8;

function matchRank(node: MindMapNode, query: string): number {
  const name = node.name.toLowerCase();
  if (name === query) return 0;
  if (name.startsWith(query)) return 1;
  const words = name.split(/[^a-z0-9]+/);
  if (words.some((word) => word.startsWith(query))) return 2;
  if (name.includes(query)) return 3;
  return -1;
}

export function matchNodes(nodes: MindMapNode[], query: string): MindMapNode[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return [];
  return nodes
    .map((node) => ({ node, rank: matchRank(node, trimmed) }))
    .filter((item) => item.rank >= 0)
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        a.node.name.localeCompare(b.node.name, undefined, {
          sensitivity: "base",
        }),
    )
    .slice(0, MAX_MATCHES)
    .map((item) => item.node);
}
