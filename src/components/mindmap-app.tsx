"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Upload, Loader2, Save } from "lucide-react";
import { ReactFlowProvider } from "@xyflow/react";
import { MindMapGraph } from "@/components/mindmap-graph";
import { NodePanel } from "@/components/node-panel";
import { AddNodeForm } from "@/components/add-node-form";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { NODE_TYPE_CONFIG } from "@/lib/node-styles";
import {
  fetchMindMap,
  mutateMindMap,
  replaceMindMap,
} from "@/lib/mindmap-client";
import type { MindMapData, MindMapNode, NodeType } from "@/types/mindmap";

type MindMapAppProps = {
  initialData?: MindMapData | null;
};

export function MindMapApp({ initialData = null }: MindMapAppProps) {
  const [data, setData] = useState<MindMapData | null>(initialData);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(!initialData);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchMindMap()
      .then((next) => {
        if (!cancelled) {
          setData(next);
          setError(null);
        }
      })
      .catch(() => {
        if (!cancelled && !initialData) {
          setError("Could not load mind map. Is the dev server running?");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [initialData]);

  const persist = useCallback(async (next: MindMapData) => {
    setSaving(true);
    try {
      const saved = await replaceMindMap(next);
      setData(saved);
      setDirty(false);
    } catch {
      setError("Failed to save changes.");
    } finally {
      setSaving(false);
    }
  }, []);

  const scheduleSave = useCallback(
    (next: MindMapData) => {
      setData(next);
      setDirty(true);
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => persist(next), 800);
    },
    [persist],
  );

  const selectedNode =
    data?.nodes.find((n) => n.id === selectedNodeId) ?? null;

  async function handleSaveNode(node: MindMapNode) {
    if (!data) return;
    const saved = await mutateMindMap({ action: "updateNode", node });
    setData(saved);
    setDirty(false);
  }

  async function handleDeleteNode(id: string) {
    if (!data) return;
    const saved = await mutateMindMap({ action: "deleteNode", id });
    setData(saved);
    if (selectedNodeId === id) setSelectedNodeId(null);
    setDirty(false);
  }

  async function handleAddNode(node: MindMapNode) {
    if (!data) return;
    const saved = await mutateMindMap({ action: "addNode", node });
    setData(saved);
    setSelectedNodeId(node.id);
    setDirty(false);
  }

  async function handleAddEdge(source: string, target: string, label?: string) {
    if (!data) return;
    const edge = {
      id: `e-${source}-${target}-${Date.now()}`,
      source,
      target,
      label,
    };
    const saved = await mutateMindMap({ action: "addEdge", edge });
    setData(saved);
    setDirty(false);
  }

  async function handleDeleteEdge(id: string) {
    if (!data) return;
    const saved = await mutateMindMap({ action: "deleteEdge", id });
    setData(saved);
    setDirty(false);
  }

  function handleExport() {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "impact-mindmap.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImport(file: File) {
    try {
      const text = await file.text();
      const imported = JSON.parse(text) as MindMapData;
      const saved = await replaceMindMap(imported);
      setData(saved);
      setSelectedNodeId(null);
      setDirty(false);
    } catch {
      setError("Invalid JSON file.");
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading mind map…
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-destructive">
        {error}
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b px-3 py-2 md:px-4 md:py-3">
        <div className="mr-auto min-w-0">
          <h1 className="text-base font-semibold truncate md:text-lg">
            Impact Mind Map
          </h1>
          <p className="text-xs text-muted-foreground hidden sm:block">
            Purpose-driven job search · Leonidas Bothmer
          </p>
        </div>

        <div className="hidden lg:flex items-center gap-1.5">
          {(Object.keys(NODE_TYPE_CONFIG) as NodeType[]).map((t) => (
            <Badge
              key={t}
              variant="outline"
              className={`text-[10px] ${NODE_TYPE_CONFIG[t].bg} ${NODE_TYPE_CONFIG[t].border}`}
            >
              {NODE_TYPE_CONFIG[t].label}
            </Badge>
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          {dirty && (
            <span className="text-xs text-muted-foreground hidden sm:inline">
              Unsaved layout…
            </span>
          )}
          {saving && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          <Button
            variant="outline"
            size="sm"
            onClick={() => persist(data)}
            disabled={!dirty || saving}
            className="gap-1"
          >
            <Save className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Save</span>
          </Button>
          <AddNodeForm onAdd={handleAddNode} />
          <Button variant="outline" size="sm" onClick={handleExport} className="gap-1">
            <Download className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Export</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            className="gap-1"
          >
            <Upload className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Import</span>
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleImport(file);
              e.target.value = "";
            }}
          />
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <main className="relative min-h-[50vh] flex-1 md:min-h-0">
          <ReactFlowProvider>
            <MindMapGraph
              data={data}
              selectedNodeId={selectedNodeId}
              onSelectNode={setSelectedNodeId}
              onDataChange={scheduleSave}
            />
          </ReactFlowProvider>
        </main>

        <aside className="w-full shrink-0 border-t md:w-80 md:border-t-0 md:border-l lg:w-96">
          <NodePanel
            node={selectedNode}
            data={data}
            onSave={handleSaveNode}
            onDelete={handleDeleteNode}
            onAddEdge={handleAddEdge}
            onDeleteEdge={handleDeleteEdge}
          />
        </aside>
      </div>
    </div>
  );
}
