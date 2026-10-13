import { NextResponse } from "next/server";
import {
  applyActions,
  readMindMap,
  writeMindMap,
} from "@/lib/mindmap-store";
import type {
  MindMapAction,
  MindMapData,
  MindMapPatchBody,
} from "@/types/mindmap";

function errorStatus(error: unknown): number {
  if (
    error &&
    typeof error === "object" &&
    "status" in error &&
    typeof (error as { status: unknown }).status === "number"
  ) {
    return (error as { status: number }).status;
  }
  return 500;
}

export async function GET() {
  try {
    const data = await readMindMap();
    return NextResponse.json(data);
  } catch (error) {
    const status = errorStatus(error);
    if (status === 401) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("GET /api/mindmap failed:", error);
    return NextResponse.json(
      { error: "Failed to read mind map data" },
      { status },
    );
  }
}

function normalizeActions(body: MindMapPatchBody): MindMapAction[] {
  if ("actions" in body && Array.isArray(body.actions)) {
    return body.actions;
  }
  return [body as MindMapAction];
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as MindMapPatchBody;
    const actions = normalizeActions(body);
    if (actions.length === 0) {
      return NextResponse.json(
        { error: "No actions provided" },
        { status: 400 },
      );
    }

    // Full replace via POST is rejected; use PUT for import.
    if (actions.some((a) => a.action === "replace")) {
      return NextResponse.json(
        { error: "Use PUT for full document replace" },
        { status: 400 },
      );
    }

    const saved = await applyActions(actions);
    return NextResponse.json(saved);
  } catch (error) {
    const status = errorStatus(error);
    if (status === 401) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("POST /api/mindmap failed:", error);
    return NextResponse.json(
      { error: "Failed to update mind map data" },
      { status },
    );
  }
}

export async function PUT(request: Request) {
  try {
    const data = (await request.json()) as MindMapData;
    const force = new URL(request.url).searchParams.get("force") === "1";
    const saved = await writeMindMap(data, { force });
    return NextResponse.json(saved);
  } catch (error) {
    const stale =
      error instanceof Error &&
      "status" in error &&
      (error as Error & { status?: number }).status === 409;
    if (stale) {
      return NextResponse.json(
        {
          error: "Stale mind map revision",
          current: (error as Error & { current?: MindMapData }).current,
        },
        { status: 409 },
      );
    }
    console.error("PUT /api/mindmap failed:", error);
    return NextResponse.json(
      { error: "Failed to replace mind map data" },
      { status: 500 },
    );
  }
}
