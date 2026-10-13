import type { MindMapData, MindMapEdge, MindMapNode } from "@/types/mindmap";

/** Tags that belong on the private overlay, never the shared graph. */
export const PRIVATE_TAGS = new Set(["contact", "contacted"]);

export type PrivateContactFields = {
  orgEmail?: string;
  email?: string;
  phone?: string;
};

export type PrivateOrgOverlay = PrivateContactFields & {
  id: string;
  /** Tags that were stripped from the shared node (contact / contacted). */
  tags?: string[];
};

export type PrivateMindMapData = {
  nodes: MindMapNode[];
  edges: MindMapEdge[];
  /** Contact fields stripped from shared (non-person) nodes. */
  orgOverlays?: PrivateOrgOverlay[];
  updatedAt?: string;
  revision?: number;
};

export function isPrivateNode(node: MindMapNode): boolean {
  return node.type === "person";
}

export function stripPrivateFieldsFromSharedNode(
  node: MindMapNode,
): { shared: MindMapNode; overlay: PrivateOrgOverlay | null } {
  const {
    orgEmail,
    email,
    phone,
    tags,
    ...rest
  } = node;

  const publicTags = tags?.filter((t) => !PRIVATE_TAGS.has(t));
  const privateTags = tags?.filter((t) => PRIVATE_TAGS.has(t));

  const shared: MindMapNode = {
    ...rest,
    ...(publicTags && publicTags.length > 0 ? { tags: publicTags } : {}),
  };

  const hasContact =
    orgEmail !== undefined ||
    email !== undefined ||
    phone !== undefined ||
    (privateTags !== undefined && privateTags.length > 0);

  if (!hasContact) {
    return { shared, overlay: null };
  }

  return {
    shared,
    overlay: {
      id: node.id,
      ...(orgEmail !== undefined ? { orgEmail } : {}),
      ...(email !== undefined ? { email } : {}),
      ...(phone !== undefined ? { phone } : {}),
      ...(privateTags && privateTags.length > 0 ? { tags: privateTags } : {}),
    },
  };
}

export function applyOrgOverlay(
  node: MindMapNode,
  overlay: PrivateOrgOverlay | undefined,
): MindMapNode {
  if (!overlay) return node;
  const mergedTags = [
    ...(node.tags ?? []),
    ...(overlay.tags ?? []).filter((t) => !(node.tags ?? []).includes(t)),
  ];
  return {
    ...node,
    ...(overlay.orgEmail !== undefined ? { orgEmail: overlay.orgEmail } : {}),
    ...(overlay.email !== undefined ? { email: overlay.email } : {}),
    ...(overlay.phone !== undefined ? { phone: overlay.phone } : {}),
    ...(mergedTags.length > 0 ? { tags: mergedTags } : {}),
  };
}

/**
 * Split a merged mind map into shareable public data and a private overlay.
 */
export function splitMindMap(data: MindMapData): {
  shared: MindMapData;
  private: PrivateMindMapData;
} {
  const personIds = new Set(
    data.nodes.filter(isPrivateNode).map((n) => n.id),
  );

  const sharedNodes: MindMapNode[] = [];
  const privateNodes: MindMapNode[] = [];
  const orgOverlays: PrivateOrgOverlay[] = [];

  for (const node of data.nodes) {
    if (isPrivateNode(node)) {
      privateNodes.push(node);
      continue;
    }
    const { shared, overlay } = stripPrivateFieldsFromSharedNode(node);
    sharedNodes.push(shared);
    if (overlay) orgOverlays.push(overlay);
  }

  const sharedEdges: MindMapEdge[] = [];
  const privateEdges: MindMapEdge[] = [];
  for (const edge of data.edges) {
    if (personIds.has(edge.source) || personIds.has(edge.target)) {
      privateEdges.push(edge);
    } else {
      sharedEdges.push(edge);
    }
  }

  const meta = {
    updatedAt: data.updatedAt,
    revision: data.revision,
  };

  return {
    shared: { nodes: sharedNodes, edges: sharedEdges, ...meta },
    private: {
      nodes: privateNodes,
      edges: privateEdges,
      ...(orgOverlays.length > 0 ? { orgOverlays } : {}),
      ...meta,
    },
  };
}

/**
 * Merge shared + private files into one MindMapData for the UI / API.
 */
export function mergeMindMap(
  shared: MindMapData,
  privateData: PrivateMindMapData,
): MindMapData {
  const overlayById = new Map(
    (privateData.orgOverlays ?? []).map((o) => [o.id, o]),
  );

  const sharedWithOverlays = shared.nodes.map((node) =>
    applyOrgOverlay(node, overlayById.get(node.id)),
  );

  return {
    nodes: [...sharedWithOverlays, ...privateData.nodes],
    edges: [...shared.edges, ...privateData.edges],
    updatedAt: shared.updatedAt ?? privateData.updatedAt,
    revision: Math.max(shared.revision ?? 0, privateData.revision ?? 0),
  };
}

export function emptyPrivateData(): PrivateMindMapData {
  return { nodes: [], edges: [], orgOverlays: [] };
}
