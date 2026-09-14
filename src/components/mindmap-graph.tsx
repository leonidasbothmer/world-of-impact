"use client";

import { useCallback, useEffect, useRef } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type OnConnect,
  type OnNodeDrag,
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

function flowSignature(data: MindMapData): string {
  return `${data.updatedAt ?? ""}|${data.nodes.length}|${data.edges.length}|${data.nodes
    .map((n) => n.id)
    .join(",")}|${data.edges.map((e) => e.id).join(",")}`;
}

export function MindMapGraph({
  data,
  selectedNodeId,
  onSelectNode,
  onDataChange,
}: MindMapGraphProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState(
    toFlowNodes(data.nodes, selectedNodeId),
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState(toFlowEdges(data.edges));
  const syncedSig = useRef(flowSignature(data));
  const dataRef = useRef(data);
  dataRef.current = data;

  // Sync from parent when node/edge identity set changes (CRUD), not on every drag tick.
  useEffect(() => {
    const sig = flowSignature(data);
    if (sig === syncedSig.current) {
      setNodes((current) =>
        current.map((n) => ({
          ...n,
          selected: n.id === selectedNodeId,
          data: {
            node:
              data.nodes.find((dn) => dn.id === n.id) ??
              (n.data as { node: MindMapNode }).node,
          },
        })),
      );
      return;
    }
    syncedSig.current = sig;
    setNodes(toFlowNodes(data.nodes, selectedNodeId));
    setEdges(toFlowEdges(data.edges));
  }, [data, selectedNodeId, setNodes, setEdges]);

  const persistPositions = useCallback(
    (nextNodes: Node[]) => {
      const current = dataRef.current;
      const updated = current.nodes.map((node) => {
        const flowNode = nextNodes.find((n) => n.id === node.id);
        if (!flowNode) return node;
        return { ...node, position: flowNode.position };
      });
      const next = { ...current, nodes: updated };
      syncedSig.current = flowSignature(next);
      onDataChange(next);
    },
    [onDataChange],
  );

  const onNodeDragStop: OnNodeDrag = useCallback(
    (_event, _node, nextNodes) => {
      persistPositions(nextNodes);
    },
    [persistPositions],
  );

  const onConnect: OnConnect = useCallback(
    (connection) => {
      if (!connection.source || !connection.target) return;
      const current = dataRef.current;
      const newEdge = {
        id: `e-${connection.source}-${connection.target}-${Date.now()}`,
        source: connection.source,
        target: connection.target,
      };
      const next = { ...current, edges: [...current.edges, newEdge] };
      syncedSig.current = flowSignature(next);
      setEdges(toFlowEdges(next.edges));
      onDataChange(next);
    },
    [onDataChange, setEdges],
  );

  const handleEdgesChange = useCallback(
    (changes: Parameters<typeof onEdgesChange>[0]) => {
      onEdgesChange(changes);
      const removes = changes.filter((c) => c.type === "remove");
      if (removes.length === 0) return;
      const removedIds = new Set(removes.map((c) => c.id));
      const current = dataRef.current;
      const next = {
        ...current,
        edges: current.edges.filter((e) => !removedIds.has(e.id)),
      };
      syncedSig.current = flowSignature(next);
      onDataChange(next);
    },
    [onEdgesChange, onDataChange],
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
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onNodeDragStop={onNodeDragStop}
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
