import { MindMapApp } from "@/components/mindmap-app";
import { readMindMap } from "@/lib/mindmap-store";

export const dynamic = "force-dynamic";

export default async function Home() {
  const initialData = await readMindMap();

  return (
    <div className="h-dvh overflow-hidden">
      <MindMapApp initialData={initialData} />
    </div>
  );
}
