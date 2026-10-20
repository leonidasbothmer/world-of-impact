import type { MindMapNode } from "@/types/mindmap";

/** Private tag. The node is left out of the graph and its forces. */
export const HIDDEN_TAG = "hidden";

export function isHidden(node: Pick<MindMapNode, "tags">): boolean {
  return node.tags?.includes(HIDDEN_TAG) ?? false;
}

export function withHidden(node: MindMapNode, hidden: boolean): MindMapNode {
  const tags = (node.tags ?? []).filter((tag) => tag !== HIDDEN_TAG);
  if (!hidden) {
    if (tags.length === 0) {
      const { tags: _removed, ...rest } = node;
      return rest;
    }
    return { ...node, tags };
  }
  return { ...node, tags: [...tags, HIDDEN_TAG] };
}
