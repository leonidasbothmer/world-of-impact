import { NextResponse } from "next/server";
import { readMindMap, writeMindMap } from "@/lib/mindmap-store";
import type { MindMapAction, MindMapData } from "@/types/mindmap";

export async function GET() {
  try {
    const data = await readMindMap();
    return NextResponse.json(data);
  } catch (error) {
    console.error("GET /api/mindmap failed:", error);
    return NextResponse.json(
      { error: "Failed to read mind map data" },
      { status: 500 },
    );
  }
}

function applyAction(data: MindMapData, body: MindMapAction): MindMapData {
  switch (body.action) {
    case "replace":
      return body.data;
    case "addNode":
      return { ...data, nodes: [...data.nodes, body.node] };
    case "updateNode":
      return {
        ...data,
        nodes: data.nodes.map((n) =>
          n.id === body.node.id ? body.node : n,
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
    default:
      return data;
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as MindMapAction;
    const current = await readMindMap();
    const next = applyAction(current, body);
    const saved = await writeMindMap(next);
    return NextResponse.json(saved);
  } catch (error) {
    console.error("POST /api/mindmap failed:", error);
    return NextResponse.json(
      { error: "Failed to update mind map data" },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  try {
    const data = (await request.json()) as MindMapData;
    const saved = await writeMindMap(data);
    return NextResponse.json(saved);
  } catch (error) {
    console.error("PUT /api/mindmap failed:", error);
    return NextResponse.json(
      { error: "Failed to replace mind map data" },
      { status: 500 },
    );
  }
}
