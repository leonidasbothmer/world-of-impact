export type NodeType = "problem" | "solution" | "organization" | "person";

export interface NodePosition {
  x: number;
  y: number;
}

export interface MindMapNode {
  id: string;
  name: string;
  type: NodeType;
  notes?: string;
  tags?: string[];
  position: NodePosition;
  /**
   * When true, d3-force keeps this node fixed at `position` (fx/fy).
   * Pin UI not shipped yet — field is ready for drag-to-pin later.
   */
  pinned?: boolean;
  /** Organization fields */
  orgEmail?: string;
  website?: string;
  linkedIn?: string;
  orgKind?: string;
  /** Person fields */
  phone?: string;
  email?: string;
  /**
   * Avatar (person) or logo (org). Prefer remote LinkedIn/OG URLs by reference;
   * do not download into public/. Local placeholders OK as fallback.
   */
  imageUrl?: string;
}

export interface MindMapEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

export interface MindMapData {
  nodes: MindMapNode[];
  edges: MindMapEdge[];
  updatedAt?: string;
}

export type MindMapAction =
  | { action: "replace"; data: MindMapData }
  | { action: "addNode"; node: MindMapNode }
  | { action: "updateNode"; node: MindMapNode }
  | { action: "deleteNode"; id: string }
  | { action: "addEdge"; edge: MindMapEdge }
  | { action: "updateEdge"; edge: MindMapEdge }
  | { action: "deleteEdge"; id: string };
