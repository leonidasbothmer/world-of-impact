export type NodeType =
  | "problem"
  | "solution"
  | "organization"
  | "person"
  | "academic"
  | "media";

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
  /** Careers or jobs page URL. */
  careerPage?: string;
  linkedIn?: string;
  orgKind?: string;
  /** Offices or work locations. "Remote" is a normal location chip. */
  locations?: string[];
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
  /** Monotonic write clock. Stale full-document PUTs with a lower revision are rejected. */
  revision?: number;
}

export type MindMapGraphChange =
  | { reason: "positions"; positions: Record<string, NodePosition> }
  | { reason: "connect"; edge: MindMapEdge }
  | { reason: "create"; node: MindMapNode; edge: MindMapEdge }
  | { reason: "label"; id: string; label?: string }
  | { reason: "removeEdges"; ids: string[] };

export type MindMapAction =
  | { action: "replace"; data: MindMapData }
  | { action: "addNode"; node: MindMapNode }
  | { action: "updateNode"; node: MindMapNode }
  | { action: "deleteNode"; id: string }
  | { action: "addEdge"; edge: MindMapEdge }
  | { action: "updateEdge"; edge: MindMapEdge }
  | { action: "deleteEdge"; id: string }
  | { action: "updatePositions"; positions: Record<string, NodePosition> }
  | { action: "createWithEdge"; node: MindMapNode; edge: MindMapEdge }
  | { action: "deleteEdges"; ids: string[] };

export type MindMapPatchBody =
  | MindMapAction
  | { actions: MindMapAction[] };
