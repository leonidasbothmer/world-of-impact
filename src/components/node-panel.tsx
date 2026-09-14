"use client";

import { useEffect, useState } from "react";
import { Trash2, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { NODE_TYPE_CONFIG } from "@/lib/node-styles";
import type { MindMapData, MindMapNode, NodeType } from "@/types/mindmap";

type NodePanelProps = {
  node: MindMapNode | null;
  data: MindMapData;
  onSave: (node: MindMapNode) => void;
  onDelete: (id: string) => void;
  onAddEdge: (source: string, target: string, label?: string) => void;
  onDeleteEdge: (id: string) => void;
};

function emptyDraft(): MindMapNode {
  return {
    id: "",
    name: "",
    type: "problem",
    notes: "",
    tags: [],
    position: { x: 0, y: 0 },
  };
}

export function NodePanel({
  node,
  data,
  onSave,
  onDelete,
  onAddEdge,
  onDeleteEdge,
}: NodePanelProps) {
  const [draft, setDraft] = useState<MindMapNode>(emptyDraft());
  const [tagsInput, setTagsInput] = useState("");
  const [edgeTarget, setEdgeTarget] = useState("");
  const [edgeLabel, setEdgeLabel] = useState("");

  useEffect(() => {
    if (node) {
      setDraft(node);
      setTagsInput(node.tags?.join(", ") ?? "");
    }
  }, [node]);

  if (!node) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-6 text-center text-muted-foreground">
        <p className="text-sm">Select a node on the graph to view and edit its details.</p>
        <p className="mt-2 text-xs">Drag between node handles to create relationships.</p>
      </div>
    );
  }

  const connectedEdges = data.edges.filter(
    (e) => e.source === node.id || e.target === node.id,
  );

  const otherNodes = data.nodes.filter((n) => n.id !== node.id);

  function handleSave() {
    const tags = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    onSave({ ...draft, tags });
  }

  function updateField<K extends keyof MindMapNode>(key: K, value: MindMapNode[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function handleAddEdge() {
    if (!edgeTarget || !node) return;
    onAddEdge(node.id, edgeTarget, edgeLabel || undefined);
    setEdgeTarget("");
    setEdgeLabel("");
  }

  const style = NODE_TYPE_CONFIG[draft.type];

  return (
    <ScrollArea className="h-full">
      <div className="space-y-4 p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <Badge variant="outline" className={`${style.bg} ${style.border} ${style.text} mb-2`}>
              {style.label}
            </Badge>
            <h2 className="text-lg font-semibold leading-tight">{node.name}</h2>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="text-destructive hover:text-destructive shrink-0"
            onClick={() => onDelete(node.id)}
            aria-label="Delete node"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={draft.name}
              onChange={(e) => updateField("name", e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select
              value={draft.type}
              onValueChange={(v) => updateField("type", v as NodeType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(NODE_TYPE_CONFIG) as NodeType[]).map((t) => (
                  <SelectItem key={t} value={t}>
                    {NODE_TYPE_CONFIG[t].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={draft.notes ?? ""}
              onChange={(e) => updateField("notes", e.target.value)}
              rows={3}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tags">Tags (comma-separated)</Label>
            <Input
              id="tags"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="climate, startup"
            />
          </div>

          {draft.type === "organization" && (
            <>
              <Separator />
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Organization
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="orgKind">Kind</Label>
                <Input
                  id="orgKind"
                  value={draft.orgKind ?? ""}
                  onChange={(e) => updateField("orgKind", e.target.value)}
                  placeholder="startup, NGO, scaleup"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="orgEmail">Email</Label>
                <Input
                  id="orgEmail"
                  type="email"
                  value={draft.orgEmail ?? ""}
                  onChange={(e) => updateField("orgEmail", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="website">Website</Label>
                <Input
                  id="website"
                  value={draft.website ?? ""}
                  onChange={(e) => updateField("website", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="orgLinkedIn">LinkedIn</Label>
                <Input
                  id="orgLinkedIn"
                  value={draft.linkedIn ?? ""}
                  onChange={(e) => updateField("linkedIn", e.target.value)}
                />
              </div>
            </>
          )}

          {draft.type === "person" && (
            <>
              <Separator />
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Person
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={draft.phone ?? ""}
                  onChange={(e) => updateField("phone", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={draft.email ?? ""}
                  onChange={(e) => updateField("email", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="personLinkedIn">LinkedIn</Label>
                <Input
                  id="personLinkedIn"
                  value={draft.linkedIn ?? ""}
                  onChange={(e) => updateField("linkedIn", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="imageUrl">Avatar image URL</Label>
                <Input
                  id="imageUrl"
                  value={draft.imageUrl ?? ""}
                  onChange={(e) => updateField("imageUrl", e.target.value)}
                  placeholder="/avatars/name.svg"
                />
              </div>
            </>
          )}
        </div>

        <Button className="w-full" onClick={handleSave}>
          Save changes
        </Button>

        <Separator />

        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Link2 className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-medium">Relationships</h3>
          </div>

          {connectedEdges.length === 0 ? (
            <p className="text-xs text-muted-foreground">No connections yet.</p>
          ) : (
            <ul className="space-y-2">
              {connectedEdges.map((edge) => {
                const otherId = edge.source === node.id ? edge.target : edge.source;
                const other = data.nodes.find((n) => n.id === otherId);
                const direction = edge.source === node.id ? "→" : "←";
                return (
                  <li
                    key={edge.id}
                    className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-xs"
                  >
                    <span className="truncate">
                      {direction} {other?.name ?? otherId}
                      {edge.label && (
                        <span className="text-muted-foreground"> ({edge.label})</span>
                      )}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0"
                      onClick={() => onDeleteEdge(edge.id)}
                      aria-label="Remove edge"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="space-y-2 rounded-md border p-2">
            <Label className="text-xs">Add relationship</Label>
            <Select
              value={edgeTarget}
              onValueChange={(v) => setEdgeTarget(v ?? "")}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Connect to…" />
              </SelectTrigger>
              <SelectContent>
                {otherNodes.map((n) => (
                  <SelectItem key={n.id} value={n.id}>
                    {n.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              className="h-8 text-xs"
              placeholder="Label (optional)"
              value={edgeLabel}
              onChange={(e) => setEdgeLabel(e.target.value)}
            />
            <Button
              size="sm"
              variant="secondary"
              className="w-full"
              disabled={!edgeTarget}
              onClick={handleAddEdge}
            >
              Add edge
            </Button>
          </div>
        </div>
      </div>
    </ScrollArea>
  );
}
