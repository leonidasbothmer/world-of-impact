import type { MindMapEdge, MindMapNode, NodeType } from "@/types/mindmap";
import { isPrivateTag } from "@/lib/mindmap-split";

export type SharedNodeRow = {
  id: string;
  name: string;
  type: Exclude<NodeType, "person">;
  notes: string | null;
  tags: string[] | null;
  website: string | null;
  career_page: string | null;
  linked_in: string | null;
  org_kind: string | null;
  locations: string[] | null;
  image_url: string | null;
};

export type SharedEdgeRow = {
  id: string;
  source: string;
  target: string;
  label: string | null;
};

export type LayoutRow = {
  node_id: string;
  x: number;
  y: number;
};

export type PrivateNodeRow = {
  id: string;
  name: string;
  type: "person";
  notes: string | null;
  tags: string[] | null;
  linked_in: string | null;
  image_url: string | null;
};

export type PrivateEdgeRow = {
  id: string;
  source: string;
  target: string;
  label: string | null;
};

export type ContactDetailsRow = {
  node_id: string;
  email: string | null;
  phone: string | null;
  org_email: string | null;
  tags: string[] | null;
};

export type PrivateNotesRow = {
  shared_node_id: string;
  body: string;
};

export function sharedNodeToMindMap(
  row: SharedNodeRow,
  layout?: LayoutRow,
  contact?: ContactDetailsRow,
  privateNote?: string,
): MindMapNode {
  const tags = [
    ...(row.tags ?? []),
    ...(contact?.tags ?? []).filter((t) => !(row.tags ?? []).includes(t)),
  ];
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    notes: privateNote ?? row.notes ?? undefined,
    ...(tags.length > 0 ? { tags } : {}),
    position: { x: layout?.x ?? 0, y: layout?.y ?? 0 },
    ...(row.website ? { website: row.website } : {}),
    ...(row.career_page ? { careerPage: row.career_page } : {}),
    ...(row.linked_in ? { linkedIn: row.linked_in } : {}),
    ...(row.org_kind ? { orgKind: row.org_kind } : {}),
    ...(row.locations && row.locations.length > 0
      ? { locations: row.locations }
      : {}),
    ...(row.image_url ? { imageUrl: row.image_url } : {}),
    ...(contact?.org_email ? { orgEmail: contact.org_email } : {}),
    ...(contact?.email ? { email: contact.email } : {}),
    ...(contact?.phone ? { phone: contact.phone } : {}),
  };
}

export function privateNodeToMindMap(
  row: PrivateNodeRow,
  layout?: LayoutRow,
  contact?: ContactDetailsRow,
): MindMapNode {
  return {
    id: row.id,
    name: row.name,
    type: "person",
    notes: row.notes ?? undefined,
    ...(row.tags && row.tags.length > 0 ? { tags: row.tags } : {}),
    position: { x: layout?.x ?? 0, y: layout?.y ?? 0 },
    ...(row.linked_in ? { linkedIn: row.linked_in } : {}),
    ...(row.image_url ? { imageUrl: row.image_url } : {}),
    ...(contact?.email ? { email: contact.email } : {}),
    ...(contact?.phone ? { phone: contact.phone } : {}),
  };
}

export function edgeRowToMindMap(
  row: SharedEdgeRow | PrivateEdgeRow,
): MindMapEdge {
  return {
    id: row.id,
    source: row.source,
    target: row.target,
    ...(row.label ? { label: row.label } : {}),
  };
}

export function mindMapNodeToSharedRow(node: MindMapNode): SharedNodeRow {
  const publicTags = (node.tags ?? []).filter((t) => !isPrivateTag(t));
  return {
    id: node.id,
    name: node.name,
    type: node.type as Exclude<NodeType, "person">,
    notes: node.notes ?? null,
    tags: publicTags,
    website: node.website ?? null,
    career_page: node.careerPage ?? null,
    linked_in: node.linkedIn ?? null,
    org_kind: node.orgKind ?? null,
    locations: node.locations ?? [],
    image_url: node.imageUrl ?? null,
  };
}

export function mindMapNodeToPrivateRow(node: MindMapNode): PrivateNodeRow {
  return {
    id: node.id,
    name: node.name,
    type: "person",
    notes: node.notes ?? null,
    tags: node.tags ?? [],
    linked_in: node.linkedIn ?? null,
    image_url: node.imageUrl ?? null,
  };
}

export function extractContactDetails(
  node: MindMapNode,
): ContactDetailsRow | null {
  const privateTags = (node.tags ?? []).filter((t) => isPrivateTag(t));
  if (
    !node.email &&
    !node.phone &&
    !node.orgEmail &&
    privateTags.length === 0
  ) {
    return null;
  }
  return {
    node_id: node.id,
    email: node.email ?? null,
    phone: node.phone ?? null,
    org_email: node.orgEmail ?? null,
    tags: privateTags,
  };
}
