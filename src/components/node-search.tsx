"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Plus, Search } from "lucide-react";
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
import { cn } from "@/lib/utils";
import type { MindMapNode, NodeType } from "@/types/mindmap";

const NODE_TYPES = Object.keys(NODE_TYPE_CONFIG) as NodeType[];

export type SearchCreateInput = {
  name: string;
  type: NodeType;
  connectToId?: string;
  edgeLabel?: string;
  linkedIn?: string;
  notes?: string;
  imageUrl?: string;
};

function highlightName(name: string, query: string) {
  const index = name.toLowerCase().indexOf(query);
  if (index < 0) return name;
  return (
    <>
      {name.slice(0, index)}
      <span className="font-semibold text-foreground">
        {name.slice(index, index + query.length)}
      </span>
      {name.slice(index + query.length)}
    </>
  );
}

export function NodeSearch({
  nodes,
  onSelect,
  onCreate,
  className,
}: {
  nodes: MindMapNode[];
  onSelect: (id: string) => void;
  onCreate: (input: SearchCreateInput) => void;
  className?: string;
}) {
  const listId = useId();
  const edgeListId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLFormElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [draftOpen, setDraftOpen] = useState(false);
  const [type, setType] = useState<NodeType>("problem");
  const [edgeTarget, setEdgeTarget] = useState("");
  const [edgeQuery, setEdgeQuery] = useState("");
  const [edgeOpen, setEdgeOpen] = useState(false);
  const [edgeLabel, setEdgeLabel] = useState("");
  const linkedInPreview = useLinkedInPreview();

  const trimmed = query.trim().toLowerCase();

  const suggestions = useMemo(
    () => matchNodes(nodes, trimmed),
    [nodes, trimmed],
  );

  useEffect(() => {
    setActiveIndex(0);
  }, [trimmed]);

  const edgeMatches = useMemo(() => {
    const q = edgeQuery.trim().toLowerCase();
    return [...nodes]
      .filter((node) => !q || node.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 8);
  }, [edgeQuery, nodes]);

  useEffect(() => {
    if (!open && !draftOpen) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (rootRef.current?.contains(target)) return;
      if (target.closest("[data-slot='select-content']")) return;
      setOpen(false);
      setDraftOpen(false);
      linkedInPreview.reset();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || !draftOpen) return;
      if (document.querySelector("[data-slot='select-content']")) return;
      if (edgeOpen) {
        setEdgeOpen(false);
        return;
      }
      linkedInPreview.reset();
      setDraftOpen(false);
    }
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [draftOpen, edgeOpen, open]);

  const showList = open && trimmed.length > 0 && !draftOpen;
  const showLinkedIn = type === "organization" || type === "person";
  const creating = showList && suggestions.length === 0;
  const displayName = query.trim();
  const optionCount = creating ? 1 : suggestions.length;
  const activeId = !showList
    ? undefined
    : creating
      ? `${listId}-option-create`
      : suggestions[activeIndex]
        ? `${listId}-option-${suggestions[activeIndex].id}`
        : undefined;

  function choose(node: MindMapNode) {
    onSelect(node.id);
    setQuery(node.name);
    setOpen(false);
  }

  function openCreate() {
    const name = query.trim();
    if (!name) return;
    setType("problem");
    setEdgeTarget("");
    setEdgeQuery("");
    setEdgeLabel("");
    setEdgeOpen(false);
    linkedInPreview.reset();
    setOpen(false);
    setDraftOpen(true);
    queueMicrotask(() => dialogRef.current?.focus());
  }

  function submitCreate(event: React.FormEvent) {
    event.preventDefault();
    const name = query.trim();
    if (!name || linkedInPreview.pending) return;
    void (async () => {
      const result = await linkedInPreview.resolve();
      if (!result.ok) return;
      onCreate({
        name,
        type,
        connectToId: edgeTarget || undefined,
        edgeLabel: edgeLabel.trim() || undefined,
        linkedIn: result.preview?.linkedIn,
        notes: result.preview?.notes,
        imageUrl: result.preview?.imageUrl,
      });
      setQuery(name);
      setDraftOpen(false);
      setOpen(false);
    })();
  }

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        role="combobox"
        aria-label="Find a node"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={activeId}
        placeholder="Find a node"
        value={query}
        className="h-8 pl-8"
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          if (query.trim()) setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            if (!showList) {
              if (trimmed) setOpen(true);
              setActiveIndex(0);
              return;
            }
            setActiveIndex((index) =>
              optionCount === 0 ? 0 : Math.min(index + 1, optionCount - 1),
            );
            return;
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            setActiveIndex((index) => Math.max(index - 1, 0));
            return;
          }
          if (event.key === "Enter") {
            if (draftOpen) return;
            event.preventDefault();
            if (creating) {
              openCreate();
              return;
            }
            const node = suggestions[activeIndex];
            if (showList && node) choose(node);
            return;
          }
          if (event.key === "Escape") {
            if (draftOpen) return;
            setOpen(false);
          }
        }}
      />
      {showList ? (
        <ul
          id={listId}
          role="listbox"
          aria-label="Matching nodes"
          className="absolute top-full right-0 left-0 z-50 mt-1 max-h-72 overflow-y-auto rounded-lg border bg-popover p-1 shadow-md"
        >
          {creating ? (
            <li role="presentation">
              <button
                id={`${listId}-option-create`}
                type="button"
                role="option"
                aria-selected
                className="flex w-full items-center gap-2 rounded-md bg-muted px-2.5 py-1.5 text-left text-sm text-foreground"
                onMouseDown={(event) => event.preventDefault()}
                onClick={openCreate}
              >
                <Plus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">
                  Create “{displayName}”
                </span>
              </button>
            </li>
          ) : (
            suggestions.map((node, index) => {
              const type = NODE_TYPE_CONFIG[node.type];
              return (
                <li key={node.id} role="presentation">
                  <button
                    id={`${listId}-option-${node.id}`}
                    type="button"
                    role="option"
                    aria-selected={index === activeIndex}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm",
                      index === activeIndex
                        ? "bg-muted text-foreground"
                        : "hover:bg-muted",
                    )}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => choose(node)}
                  >
                    <span
                      className={cn("h-2 w-2 shrink-0 rounded-full", type.dot)}
                    />
                    <span className="min-w-0 flex-1 truncate text-muted-foreground">
                      {highlightName(node.name, trimmed)}
                    </span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {type.label}
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      ) : null}
      {draftOpen ? (
        <form
          ref={dialogRef}
          role="dialog"
          aria-label={`Create ${displayName}`}
          tabIndex={-1}
          className="absolute top-full left-0 z-50 mt-1 w-72 max-w-[calc(100vw-1.5rem)] rounded-lg border bg-popover p-3 text-popover-foreground shadow-lg outline-none"
          onSubmit={submitCreate}
        >
          <p className="mb-3 truncate text-sm font-medium">
            Create “{displayName}”
          </p>
          <div className="space-y-2.5">
            <div className="space-y-1">
              <Label className="text-xs">Type</Label>
              <Select
                value={type}
                onValueChange={(value) => {
                  const next = value as NodeType;
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
                  {NODE_TYPES.map((nodeType) => (
                    <SelectItem key={nodeType} value={nodeType}>
                      {NODE_TYPE_CONFIG[nodeType].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs" htmlFor={edgeListId}>
                Connect to
              </Label>
              <div className="relative">
                <Input
                  id={edgeListId}
                  role="combobox"
                  aria-expanded={edgeOpen}
                  aria-controls={`${edgeListId}-list`}
                  aria-autocomplete="list"
                  className="h-8"
                  placeholder="Optional"
                  value={edgeQuery}
                  autoComplete="off"
                  onChange={(event) => {
                    setEdgeQuery(event.target.value);
                    setEdgeTarget("");
                    setEdgeOpen(true);
                  }}
                  onFocus={() => setEdgeOpen(true)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape" && edgeOpen) {
                      event.preventDefault();
                      event.stopPropagation();
                      setEdgeOpen(false);
                      return;
                    }
                    if (event.key === "Enter" && edgeOpen && edgeMatches[0]) {
                      event.preventDefault();
                      setEdgeTarget(edgeMatches[0].id);
                      setEdgeQuery(edgeMatches[0].name);
                      setEdgeOpen(false);
                    }
                  }}
                />
                {edgeOpen ? (
                  <ul
                    id={`${edgeListId}-list`}
                    role="listbox"
                    className="absolute top-full right-0 left-0 z-10 mt-1 max-h-40 overflow-auto rounded-md border bg-popover p-1 shadow-md"
                  >
                    {edgeMatches.length === 0 ? (
                      <li className="px-2 py-1.5 text-xs text-muted-foreground">
                        No matches
                      </li>
                    ) : (
                      edgeMatches.map((node) => (
                        <li key={node.id} role="presentation">
                          <button
                            type="button"
                            role="option"
                            aria-selected={edgeTarget === node.id}
                            className="w-full rounded-sm px-2 py-1.5 text-left text-xs hover:bg-accent"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => {
                              setEdgeTarget(node.id);
                              setEdgeQuery(node.name);
                              setEdgeOpen(false);
                            }}
                          >
                            {node.name}
                          </button>
                        </li>
                      ))
                    )}
                  </ul>
                ) : null}
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs" htmlFor={`${edgeListId}-label`}>
                Relationship label
              </Label>
              <Input
                id={`${edgeListId}-label`}
                className="h-8"
                placeholder="Optional"
                value={edgeLabel}
                onChange={(event) => setEdgeLabel(event.target.value)}
              />
            </div>
            {showLinkedIn ? (
              <LinkedInField
                id={`${edgeListId}-linkedin`}
                value={linkedInPreview.linkedIn}
                onChange={linkedInPreview.onChange}
                error={linkedInPreview.error}
                disabled={linkedInPreview.pending}
                labelClassName="text-xs"
                inputClassName="h-8"
              />
            ) : null}
            <div className="flex gap-2 pt-0.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => {
                  linkedInPreview.reset();
                  setDraftOpen(false);
                }}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                className="flex-1"
                disabled={linkedInPreview.pending}
              >
                {linkedInPreview.pending ? "Creating…" : "Create"}
              </Button>
            </div>
          </div>
        </form>
      ) : null}
    </div>
  );
}
