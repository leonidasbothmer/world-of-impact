"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
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

export type CreateNodeDraftState = {
  sourceId: string;
  position: { x: number; y: number };
  screen: { x: number; y: number };
  defaultType: NodeType;
};

type CreateNodeDraftProps = {
  draft: CreateNodeDraftState;
  nodes: MindMapNode[];
  onConfirm: (input: {
    name: string;
    type: NodeType;
    linkedIn?: string;
    notes?: string;
    imageUrl?: string;
  }) => void;
  onSelectExisting: (id: string) => void;
  onCancel: () => void;
};

export function CreateNodeDraft({
  draft,
  nodes,
  onConfirm,
  onSelectExisting,
  onCancel,
}: CreateNodeDraftProps) {
  const listId = useId();
  const [name, setName] = useState("");
  const [type, setType] = useState<NodeType>(draft.defaultType);
  const [activeIndex, setActiveIndex] = useState(0);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const linkedInPreview = useLinkedInPreview();
  const matches = useMemo(() => matchNodes(nodes, name), [nodes, name]);
  const showSuggestions = suggestionsOpen && matches.length > 0;
  const showLinkedIn = type === "organization" || type === "person";
  const showSuggestionsRef = useRef(showSuggestions);
  showSuggestionsRef.current = showSuggestions;

  useEffect(() => {
    setName("");
    setType(draft.defaultType);
    return () => {
      linkedInPreview.reset();
    };
  }, [draft, linkedInPreview.reset]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (showSuggestionsRef.current) return;
        event.preventDefault();
        event.stopPropagation();
        onCancel();
      }
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [onCancel]);

  const left = Math.min(draft.screen.x + 12, window.innerWidth - 300);
  const top = Math.max(
    8,
    Math.min(
      draft.screen.y + 12,
      window.innerHeight - (showSuggestions ? 500 : 320),
    ),
  );

  return (
    <div
      className="fixed z-50 w-72 rounded-lg border bg-background p-3 shadow-lg"
      style={{ left, top }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <p className="mb-2 text-xs font-medium text-muted-foreground">
        New node · Esc to cancel
      </p>
      <form
        className="space-y-2.5"
        onSubmit={(event) => {
          event.preventDefault();
          const trimmed = name.trim();
          if (!trimmed || linkedInPreview.pending) return;
          void (async () => {
            const result = await linkedInPreview.resolve();
            if (!result.ok) return;
            onConfirm({
              name: trimmed,
              type,
              linkedIn: result.preview?.linkedIn,
              notes: result.preview?.notes,
              imageUrl: result.preview?.imageUrl,
            });
          })();
        }}
      >
        <div className="space-y-1">
          <Label htmlFor="draft-name" className="text-xs">
            Name
          </Label>
          <Input
            id="draft-name"
            role="combobox"
            aria-expanded={showSuggestions}
            aria-controls={listId}
            aria-autocomplete="list"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setActiveIndex(0);
              setSuggestionsOpen(true);
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
                onSelectExisting(matches[activeIndex].id);
                return;
              }
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                setSuggestionsOpen(false);
              }
            }}
            placeholder="Name"
            className="h-8"
            autoFocus
          />
          {showSuggestions ? (
            <ExistingNodeSuggestions
              nodes={matches}
              query={name}
              activeIndex={activeIndex}
              listId={listId}
              onHover={setActiveIndex}
              onSelect={(node) => onSelectExisting(node.id)}
            />
          ) : null}
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Type</Label>
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
            <SelectTrigger className="h-8">
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
            id="draft-linkedin"
            value={linkedInPreview.linkedIn}
            onChange={linkedInPreview.onChange}
            error={linkedInPreview.error}
            disabled={linkedInPreview.pending}
            labelClassName="text-xs"
            inputClassName="h-8"
          />
        ) : null}
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={onCancel}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            size="sm"
            className="flex-1"
            disabled={!name.trim() || linkedInPreview.pending}
          >
            {linkedInPreview.pending ? "Creating…" : "Create"}
          </Button>
        </div>
      </form>
    </div>
  );
}
