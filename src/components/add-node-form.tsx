"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { NODE_TYPE_CONFIG } from "@/lib/node-styles";
import type { MindMapNode, NodeType } from "@/types/mindmap";

type AddNodeFormProps = {
  onAdd: (node: MindMapNode) => void;
};

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function AddNodeForm({ onAdd }: AddNodeFormProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<NodeType>("problem");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    const id = `${slugify(name)}-${Date.now()}`;
    onAdd({
      id,
      name: name.trim(),
      type,
      notes: "",
      tags: [],
      position: {
        x: Math.round(Math.random() * 200 - 100),
        y: Math.round(Math.random() * 200 - 100),
      },
    });
    setName("");
    setType("problem");
    setOpen(false);
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Button
        size="sm"
        className="gap-1.5"
        onClick={() => setOpen(true)}
      >
        <Plus className="h-4 w-4" />
        Add node
      </Button>
      <SheetContent side="bottom" className="h-auto max-h-[80vh]">
        <SheetHeader>
          <SheetTitle>Add a node</SheetTitle>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="mt-4 space-y-4 pb-4">
          <div className="space-y-1.5">
            <Label htmlFor="new-name">Name</Label>
            <Input
              id="new-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Carbon accounting"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as NodeType)}>
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
          <Button type="submit" className="w-full" disabled={!name.trim()}>
            Create node
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
