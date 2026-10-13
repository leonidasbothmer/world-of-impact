import type { MindMapNode } from "@/types/mindmap";

/** Private tag. Membership in the job tracker, not a label on the shared graph. */
export const TRACKED_TAG = "tracked";

export function isTracked(node: MindMapNode): boolean {
  return node.tags?.includes(TRACKED_TAG) ?? false;
}

export function visibleTags(tags: string[] | undefined): string[] {
  return (tags ?? []).filter((tag) => tag !== TRACKED_TAG);
}

export function withTracked(node: MindMapNode, tracked: boolean): MindMapNode {
  const tags = visibleTags(node.tags);
  if (tracked) tags.push(TRACKED_TAG);
  if (tags.length === 0) {
    const { tags: _removed, ...rest } = node;
    return rest;
  }
  return { ...node, tags };
}
