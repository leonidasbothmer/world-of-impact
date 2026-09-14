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
  /** Organization fields */
  orgEmail?: string;
  website?: string;
  linkedIn?: string;
  orgKind?: string;
  /** Person fields */
  phone?: string;
  email?: string;
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
