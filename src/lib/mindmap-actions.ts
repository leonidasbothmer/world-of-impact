import type {
  MindMapAction,
  MindMapData,
  MindMapEdge,
  MindMapNode,
  NodePosition,
} from "@/types/mindmap";

export function applyMindMapAction(
  data: MindMapData,
  body: MindMapAction,
): MindMapData {
  switch (body.action) {
    case "replace":
      return body.data;
    case "addNode":
      if (data.nodes.some((n) => n.id === body.node.id)) return data;
      return { ...data, nodes: [...data.nodes, body.node] };
    case "updateNode":
      return {
        ...data,
        nodes: data.nodes.map((n) =>
          n.id === body.node.id
            ? { ...body.node, position: n.position }
            : n,
        ),
      };
    case "deleteNode":
      return {
        ...data,
        nodes: data.nodes.filter((n) => n.id !== body.id),
        edges: data.edges.filter(
          (e) => e.source !== body.id && e.target !== body.id,
        ),
      };
    case "addEdge":
      if (
        data.edges.some(
          (e) =>
            e.id === body.edge.id ||
            (e.source === body.edge.source && e.target === body.edge.target),
        )
      ) {
        return data;
      }
      return { ...data, edges: [...data.edges, body.edge] };
    case "updateEdge":
      return {
        ...data,
        edges: data.edges.map((e) =>
          e.id === body.edge.id ? body.edge : e,
        ),
      };
    case "deleteEdge":
      return {
        ...data,
        edges: data.edges.filter((e) => e.id !== body.id),
      };
    case "updatePositions": {
      const nodes = data.nodes.map((node) => {
        const pos = body.positions[node.id];
        if (!pos) return node;
        return { ...node, position: { x: pos.x, y: pos.y } };
      });
      return { ...data, nodes };
    }
    case "createWithEdge": {
      let next = data;
      if (!next.nodes.some((n) => n.id === body.node.id)) {
        next = { ...next, nodes: [...next.nodes, body.node] };
      }
      if (!next.edges.some((e) => e.id === body.edge.id)) {
        next = { ...next, edges: [...next.edges, body.edge] };
      }
      return next;
    }
    case "deleteEdges":
      return {
        ...data,
        edges: data.edges.filter((e) => !body.ids.includes(e.id)),
      };
    default:
      return data;
  }
}

export function applyMindMapActions(
  data: MindMapData,
  actions: MindMapAction[],
): MindMapData {
  return actions.reduce(applyMindMapAction, data);
}

export type { MindMapAction, MindMapData, MindMapEdge, MindMapNode, NodePosition };
