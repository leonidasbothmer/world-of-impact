"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { ExistingNodeSuggestions } from "@/components/existing-node-suggestions";
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
import { LinkedInField } from "@/components/linkedin-field";
import { matchNodes } from "@/lib/node-match";
import { NODE_TYPE_CONFIG } from "@/lib/node-styles";
import { useLinkedInPreview } from "@/lib/use-linkedin-preview";
import type { MindMapNode, NodeType } from "@/types/mindmap";

type AddNodeFormProps = {
  nodes: MindMapNode[];
  onAdd: (node: MindMapNode) => void;
  onSelectExisting: (id: string) => void;
};

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function AddNodeForm({
  nodes,
  onAdd,
  onSelectExisting,
}: AddNodeFormProps) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const suggestionsOpenRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<NodeType>("problem");
  const [activeIndex, setActiveIndex] = useState(0);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const linkedInPreview = useLinkedInPreview();

  const matches = useMemo(() => matchNodes(nodes, name), [nodes, name]);
  const showSuggestions = suggestionsOpen && matches.length > 0;
  const showLinkedIn = type === "organization" || type === "person";
  suggestionsOpenRef.current = showSuggestions;

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (rootRef.current?.contains(target)) return;
      if (target.closest("[data-slot='select-content']")) return;
      setOpen(false);
      reset();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (document.querySelector("[data-slot='select-content']")) return;
      if (suggestionsOpenRef.current) return;
      setOpen(false);
      reset();
    }
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function reset() {
    setName("");
    setType("problem");
    setActiveIndex(0);
    setSuggestionsOpen(false);
    linkedInPreview.reset();
  }

  function selectExisting(node: MindMapNode) {
    reset();
    setOpen(false);
    onSelectExisting(node.id);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || linkedInPreview.pending) return;

    void (async () => {
      const result = await linkedInPreview.resolve();
      if (!result.ok) return;
      const id = `${slugify(trimmed)}-${Date.now()}`;
      onAdd({
        id,
        name: trimmed,
        type,
        notes: result.preview?.notes ?? "",
        tags: [],
        position: {
          x: Math.round(Math.random() * 200 - 100),
          y: Math.round(Math.random() * 200 - 100),
        },
        ...(result.preview?.linkedIn
          ? { linkedIn: result.preview.linkedIn }
          : {}),
        ...(result.preview?.imageUrl
          ? { imageUrl: result.preview.imageUrl }
          : {}),
      });
      reset();
      setOpen(false);
    })();
  }

  return (
    <div className="relative" ref={rootRef}>
      <Button
        size="sm"
        className="gap-1.5"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() =>
          setOpen((current) => {
            if (current) reset();
            return !current;
          })
        }
      >
        <Plus className="h-4 w-4" />
        Add node
      </Button>
      {open ? (
        <div
          role="dialog"
          aria-label="Add a node"
          className="absolute right-0 top-full z-50 mt-2 w-80 max-h-[min(32rem,70vh)] overflow-y-auto rounded-lg border bg-popover p-3 text-popover-foreground shadow-lg"
        >
          <p className="mb-3 text-sm font-medium">Add a node</p>
          <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="new-name">Name</Label>
            <Input
              id="new-name"
              role="combobox"
              aria-expanded={showSuggestions}
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={
                showSuggestions && matches[activeIndex]
                  ? `${listId}-option-${matches[activeIndex].id}`
                  : undefined
              }
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setActiveIndex(0);
                setSuggestionsOpen(true);
              }}
              onFocus={() => {
                if (name.trim()) setSuggestionsOpen(true);
              }}
              onKeyDown={(event) => {
                if (!showSuggestions) return;
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setActiveIndex((index) =>
                    Math.min(index + 1, matches.length - 1),
                  );
                  return;
                }
                if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setActiveIndex((index) => Math.max(index - 1, 0));
                  return;
                }
                if (event.key === "Enter" && matches[activeIndex]) {
                  event.preventDefault();
                  selectExisting(matches[activeIndex]);
                  return;
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  event.stopPropagation();
                  setSuggestionsOpen(false);
                }
              }}
              placeholder="e.g. Carbon accounting"
              autoFocus
            />
            {showSuggestions ? (
              <ExistingNodeSuggestions
                nodes={matches}
                query={name}
                activeIndex={activeIndex}
                listId={listId}
                onHover={setActiveIndex}
                onSelect={selectExisting}
              />
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select
              value={type}
              onValueChange={(v) => {
                const next = v as NodeType;
                setType(next);
                if (next !== "organization" && next !== "person") {
                  linkedInPreview.reset();
                }
              }}
            >
              <SelectTrigger className="w-full">
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
          {showLinkedIn ? (
            <LinkedInField
              id="new-linkedin"
              value={linkedInPreview.linkedIn}
              onChange={linkedInPreview.onChange}
              error={linkedInPreview.error}
              disabled={linkedInPreview.pending}
              className="space-y-1.5"
            />
          ) : null}
          <Button
            type="submit"
            className="w-full"
            disabled={!name.trim() || linkedInPreview.pending}
          >
            {linkedInPreview.pending ? "Creating…" : "Create node"}
          </Button>
        </form>
        </div>
      ) : null}
    </div>
  );
}
