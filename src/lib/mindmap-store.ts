import { promises as fs } from "fs";
import path from "path";
import type { MindMapData } from "@/types/mindmap";

const DATA_PATH = path.join(process.cwd(), "data", "mindmap.json");

export async function readMindMap(): Promise<MindMapData> {
  const raw = await fs.readFile(DATA_PATH, "utf-8");
  return JSON.parse(raw) as MindMapData;
}

export async function writeMindMap(data: MindMapData): Promise<MindMapData> {
  const payload: MindMapData = {
    ...data,
    updatedAt: new Date().toISOString(),
  };
  await fs.mkdir(path.dirname(DATA_PATH), { recursive: true });
  await fs.writeFile(DATA_PATH, JSON.stringify(payload, null, 2) + "\n", "utf-8");
  return payload;
}
