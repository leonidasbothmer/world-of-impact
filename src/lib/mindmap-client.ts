import type { MindMapAction, MindMapData } from "@/types/mindmap";

export async function fetchMindMap(): Promise<MindMapData> {
  const res = await fetch("/api/mindmap", { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load mind map");
  return res.json();
}

export async function mutateMindMap(action: MindMapAction): Promise<MindMapData> {
  const res = await fetch("/api/mindmap", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(action),
  });
  if (!res.ok) throw new Error("Failed to save mind map");
  return res.json();
}

export async function replaceMindMap(data: MindMapData): Promise<MindMapData> {
  const res = await fetch("/api/mindmap", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to replace mind map");
  return res.json();
}
