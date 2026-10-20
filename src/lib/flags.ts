import type { MindMapNode } from "@/types/mindmap";

/** Private tag. A personal flag and its comment, not a label on the shared graph. */
export const FLAG_PREFIX = "flag:";

export function isFlagTag(tag: string): boolean {
  return tag.startsWith(FLAG_PREFIX);
}

export function flagTags(tags: string[] | undefined): string[] {
  return (tags ?? []).filter(isFlagTag);
}

/** Comment on a flagged node. Null when the node is not flagged. */
export function flagComment(node: Pick<MindMapNode, "tags">): string | null {
  const tag = node.tags?.find(isFlagTag);
  if (tag === undefined) return null;
  const encoded = tag.slice(FLAG_PREFIX.length);
  try {
    return decodeURIComponent(encoded);
  } catch {
    return encoded;
  }
}

export function withFlag(node: MindMapNode, comment: string): MindMapNode {
  const tags = [
    ...(node.tags ?? []).filter((tag) => !isFlagTag(tag)),
    `${FLAG_PREFIX}${encodeURIComponent(comment)}`,
  ];
  return { ...node, tags };
}

export function withoutFlag(node: MindMapNode): MindMapNode {
  const tags = (node.tags ?? []).filter((tag) => !isFlagTag(tag));
  if (tags.length === 0) {
    const { tags: _removed, ...rest } = node;
    return rest;
  }
  return { ...node, tags };
}
