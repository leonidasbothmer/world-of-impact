"use client";

import { useCallback, useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
  applyNodeChanges,
  applyEdgeChanges,
  ConnectionMode,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { MindMapFlowNode } from "@/components/mindmap-node";
import type { MindMapData, MindMapNode, NodeType } from "@/types/mindmap";

const nodeTypes = { mindmap: MindMapFlowNode };

const MINIMAP_COLORS: Record<NodeType, string> = {
  problem: "#f43f5e",
  solution: "#10b981",
  organization: "#0ea5e9",
  person: "#8b5cf6",
};

type MindMapGraphProps = {
  data: MindMapData;
  selectedNodeId: string | null;
  onSelectNode: (id: string | null) => void;
  onDataChange: (data: MindMapData) => void;
};

function toFlowNodes(nodes: MindMapNode[], selectedId: string | null): Node[] {
  return nodes.map((node) => ({
    id: node.id,
    type: "mindmap",
    position: node.position,
    data: { node },
    selected: node.id === selectedId,
  }));
}

function toFlowEdges(edges: MindMapData["edges"]): Edge[] {
  return edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: edge.label,
    animated: false,
    style: { strokeWidth: 1.5 },
    labelStyle: { fontSize: 10, fill: "var(--muted-foreground)" },
  }));
}

export function MindMapGraph({
  data,
  selectedNodeId,
  onSelectNode,
  onDataChange,
}: MindMapGraphProps) {
  const flowNodes = useMemo(
    () => toFlowNodes(data.nodes, selectedNodeId),
    [data.nodes, selectedNodeId],
  );
  const flowEdges = useMemo(() => toFlowEdges(data.edges), [data.edges]);

  const onNodesChange: OnNodesChange = useCallback(
    (changes) => {
      const nextNodes = applyNodeChanges(changes, flowNodes);
      const updated = data.nodes.map((node) => {
        const flowNode = nextNodes.find((n) => n.id === node.id);
        if (!flowNode) return node;
        return { ...node, position: flowNode.position };
      });
      onDataChange({ ...data, nodes: updated });
    },
    [data, flowNodes, onDataChange],
  );

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => {
      const nextEdges = applyEdgeChanges(changes, flowEdges);
      const updatedEdges = nextEdges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        label: typeof e.label === "string" ? e.label : undefined,
      }));
      onDataChange({ ...data, edges: updatedEdges });
    },
    [data, flowEdges, onDataChange],
  );

  const onConnect: OnConnect = useCallback(
    (connection) => {
      if (!connection.source || !connection.target) return;
      const newEdge = {
        id: `e-${connection.source}-${connection.target}-${Date.now()}`,
        source: connection.source,
        target: connection.target,
      };
      onDataChange({ ...data, edges: [...data.edges, newEdge] });
    },
    [data, onDataChange],
  );

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      onSelectNode(node.id);
    },
    [onSelectNode],
  );

  const onPaneClick = useCallback(() => {
    onSelectNode(null);
  }, [onSelectNode]);

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        connectionMode={ConnectionMode.Loose}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.2}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={20} size={1} />
        <Controls showInteractive={false} />
        <MiniMap
          nodeColor={(n) => {
            const type = (n.data as { node: MindMapNode }).node?.type as NodeType;
            return type ? MINIMAP_COLORS[type] : "#888";
          }}
          maskColor="rgba(0,0,0,0.08)"
          className="!bg-background/80"
        />
      </ReactFlow>
    </div>
  );
}
