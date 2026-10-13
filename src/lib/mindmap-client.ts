import type { MindMapAction, MindMapData } from "@/types/mindmap";

export class StaleMindMapError extends Error {
  current?: MindMapData;
  constructor(current?: MindMapData) {
    super("Stale mind map revision");
    this.name = "StaleMindMapError";
    this.current = current;
  }
}

export async function fetchMindMap(): Promise<MindMapData> {
  const res = await fetch("/api/mindmap", { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load mind map");
  return res.json();
}

/** Apply one or more patch actions. Always targets the latest server revision. */
export async function patchMindMap(
  actions: MindMapAction[],
  options?: { keepalive?: boolean },
): Promise<MindMapData | null> {
  if (actions.length === 0) return null;
  const res = await fetch("/api/mindmap", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ actions }),
    keepalive: options?.keepalive,
  });
  if (!res.ok) throw new Error("Failed to patch mind map");
  if (options?.keepalive) return null;
  return res.json();
}

/** Full document replace — reserved for explicit JSON import. */
export async function replaceMindMap(
  data: MindMapData,
  options?: { keepalive?: boolean; force?: boolean },
): Promise<MindMapData | null> {
  const url = options?.force ? "/api/mindmap?force=1" : "/api/mindmap";
  const res = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
    keepalive: options?.keepalive,
  });
  if (res.status === 409) {
    if (options?.keepalive) throw new StaleMindMapError();
    const body = (await res.json().catch(() => null)) as
      | { current?: MindMapData }
      | null;
    throw new StaleMindMapError(body?.current);
  }
  if (!res.ok) throw new Error("Failed to replace mind map");
  if (options?.keepalive) return null;
  return res.json();
}
