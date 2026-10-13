"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Link2, Loader2, Locate, Pencil, Pin, Share2, X } from "lucide-react";
import { ConfirmDelete } from "@/components/confirm-delete";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LocationSuggestInput } from "@/components/location-suggest-input";
import { appendLocation, collectLocations, normalizeLocation } from "@/lib/locations";
import { NODE_TYPE_CONFIG } from "@/lib/node-styles";
import { cn } from "@/lib/utils";
import type { MindMapData, MindMapNode, NodeType } from "@/types/mindmap";

type NodePanelProps = {
  node: MindMapNode | null;
  data: MindMapData;
  readOnly?: boolean;
  isFocusRoot?: boolean;
  onToggleFocusRoot?: () => void;
  onSave: (node: MindMapNode) => void | Promise<void>;
  onLocate?: () => void;
  onDelete: (id: string) => void;
  onAddEdge: (source: string, target: string, label?: string) => void;
  onDeleteEdge: (id: string) => void;
};

const TEXT_FIELDS = [
  "notes",
  "orgKind",
  "orgEmail",
  "website",
  "careerPage",
  "linkedIn",
  "imageUrl",
  "phone",
  "email",
] as const satisfies readonly (keyof MindMapNode)[];

function splitTags(input: string): string[] {
  return input
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function sameList(left: string[] | undefined, right: string[] | undefined) {
  const a = left ?? [];
  const b = right ?? [];
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

function isPanelDirty(
  node: MindMapNode,
  draft: MindMapNode,
  tagsInput: string,
  locationDraft: string,
) {
  if (draft.type !== node.type) return true;
  for (const key of TEXT_FIELDS) {
    if ((draft[key] ?? "") !== (node[key] ?? "")) return true;
  }
  if (!sameList(splitTags(tagsInput), node.tags)) return true;
  if (!sameList(draft.locations, node.locations)) return true;
  if (normalizeLocation(locationDraft)) return true;
  return false;
}

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
  readOnly = false,
  isFocusRoot = false,
  onToggleFocusRoot,
  onSave,
  onLocate,
  onDelete,
  onAddEdge,
  onDeleteEdge,
}: NodePanelProps) {
  const [draft, setDraft] = useState<MindMapNode>(emptyDraft());
  const [tagsInput, setTagsInput] = useState("");
  const [locationDraft, setLocationDraft] = useState("");
  const [edgeTarget, setEdgeTarget] = useState("");
  const [edgeQuery, setEdgeQuery] = useState("");
  const [edgeOpen, setEdgeOpen] = useState(false);
  const [edgeLabel, setEdgeLabel] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [linkCopied, setLinkCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const skipRenameCommit = useRef(false);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const seenNodeIdRef = useRef<string | null>(null);
  const dirtyRef = useRef(false);

  const dirty =
    node != null &&
    draft.id === node.id &&
    isPanelDirty(node, draft, tagsInput, locationDraft);
  dirtyRef.current = dirty;

  useEffect(() => {
    if (!node) return;
    const switched = seenNodeIdRef.current !== node.id;
    if (!switched && dirtyRef.current) return;
    seenNodeIdRef.current = node.id;
    setDraft(node);
    setTagsInput(node.tags?.join(", ") ?? "");
    setLocationDraft("");
    if (switched) {
      setEdgeTarget("");
      setEdgeQuery("");
      setEdgeOpen(false);
      setEdgeLabel("");
      setSaving(false);
    }
  }, [node]);

  useEffect(() => {
    skipRenameCommit.current = true;
    setRenaming(false);
    setNameDraft(node?.name ?? "");
    setLinkCopied(false);
  }, [node?.id, node?.name]);

  useEffect(() => {
    if (!renaming) return;
    renameInputRef.current?.focus();
    renameInputRef.current?.select();
  }, [renaming]);

  useEffect(() => {
    if (!linkCopied) return;
    const timer = window.setTimeout(() => setLinkCopied(false), 1600);
    return () => window.clearTimeout(timer);
  }, [linkCopied]);

  const locationCatalog = useMemo(
    () => collectLocations(data.nodes),
    [data.nodes],
  );

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
  const query = edgeQuery.trim().toLowerCase();
  const connectOptions = otherNodes
    .filter((n) => n.name.toLowerCase().includes(query))
    .sort((a, b) => a.name.localeCompare(b.name));

  function locationsWithPending(locations: string[] | undefined, pending: string) {
    return appendLocation(locations, pending) ?? locations ?? [];
  }

  async function handleSave(nameOverride?: string) {
    if (!node || saving) return;
    const name = typeof nameOverride === "string" ? nameOverride : draft.name;
    const trimmed = name.trim();
    if (!trimmed) return;
    const tags = splitTags(tagsInput);
    const locations = locationsWithPending(draft.locations, locationDraft);
    const next: MindMapNode = {
      ...draft,
      name: trimmed,
      tags,
      locations,
      position: node.position,
      pinned: node.pinned,
    };
    if (locations.length === 0) delete next.locations;
    if (!next.careerPage?.trim()) delete next.careerPage;
    setTagsInput(tags.join(", "));
    setLocationDraft("");
    setDraft(next);
    setSaving(true);
    try {
      await onSave(next);
    } finally {
      setSaving(false);
    }
  }

  function startRename() {
    skipRenameCommit.current = false;
    setNameDraft(node?.name ?? "");
    setRenaming(true);
  }

  function cancelRename() {
    skipRenameCommit.current = true;
    setNameDraft(node?.name ?? "");
    setRenaming(false);
  }

  function commitRename() {
    if (skipRenameCommit.current) return;
    skipRenameCommit.current = true;
    const trimmed = nameDraft.trim();
    setRenaming(false);
    if (!trimmed || trimmed === node?.name) return;
    handleSave(trimmed);
  }

  async function handleShare() {
    if (!node) return;
    const url = new URL(window.location.href);
    url.searchParams.set("node", node.id);
    const shareUrl = url.toString();
    try {
      await navigator.clipboard.writeText(shareUrl);
      setLinkCopied(true);
    } catch {
      if (!navigator.share) return;
      try {
        await navigator.share({ title: node.name, url: shareUrl });
      } catch {
        /* dismissed */
      }
    }
  }

  function addLocation(raw: string) {
    if (!normalizeLocation(raw)) return;
    setDraft((prev) => {
      const next = appendLocation(prev.locations, raw);
      return next ? { ...prev, locations: next } : prev;
    });
    setLocationDraft("");
  }

  function removeLocation(value: string) {
    setDraft((prev) => ({
      ...prev,
      locations: (prev.locations ?? []).filter((item) => item !== value),
    }));
  }

  function updateField<K extends keyof MindMapNode>(key: K, value: MindMapNode[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function handleAddEdge() {
    if (!edgeTarget || !node) return;
    onAddEdge(node.id, edgeTarget, edgeLabel || undefined);
    setEdgeTarget("");
    setEdgeQuery("");
    setEdgeLabel("");
    setEdgeOpen(false);
  }

  const style = NODE_TYPE_CONFIG[draft.type];

  return (
    <ScrollArea className="h-full">
      <div className="space-y-4 p-4">
        <div>
          <div className="flex items-start justify-between gap-2">
            <Badge variant="outline" className={`${style.bg} ${style.border} ${style.text}`}>
              {style.label}
            </Badge>
            <div className="flex shrink-0 items-center">
              {onLocate ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Locate node"
                  title="Center on graph"
                  className="text-muted-foreground"
                  onClick={onLocate}
                >
                  <Locate />
                </Button>
              ) : null}
              {!readOnly ? (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={linkCopied ? "Link copied" : "Share"}
                    title={linkCopied ? "Link copied" : "Copy link"}
                    className="text-muted-foreground"
                    onClick={() => void handleShare()}
                  >
                    {linkCopied ? <Check /> : <Share2 />}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={node.pinned ? "Unpin node" : "Pin node"}
                    aria-pressed={!!node.pinned}
                    title={node.pinned ? "Unpin node" : "Pin node"}
                    className={cn(
                      "text-muted-foreground",
                      node.pinned && "text-foreground",
                    )}
                    onClick={() => onSave({ ...node, pinned: !node.pinned })}
                  >
                    <Pin className={cn(node.pinned && "fill-current")} />
                  </Button>
                  <ConfirmDelete
                    key={node.id}
                    label="Delete node"
                    className="text-destructive hover:text-destructive"
                    onConfirm={() => onDelete(node.id)}
                  />
                </>
              ) : null}
            </div>
          </div>
          <div className="mt-2 flex items-center gap-0.5">
            {renaming ? (
              <input
                ref={renameInputRef}
                aria-label="Name"
                value={nameDraft}
                className="min-w-0 flex-1 border-b border-foreground/20 bg-transparent text-lg font-semibold leading-tight outline-none focus:border-foreground"
                onChange={(event) => setNameDraft(event.target.value)}
                onBlur={commitRename}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    event.currentTarget.blur();
                  } else if (event.key === "Escape") {
                    event.preventDefault();
                    cancelRename();
                  }
                }}
              />
            ) : (
              <h2 className="min-w-0 text-lg font-semibold leading-tight">{node.name}</h2>
            )}
            {!readOnly ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Rename"
                aria-pressed={renaming}
                title="Rename"
                className="shrink-0 text-muted-foreground"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => (renaming ? commitRename() : startRename())}
              >
                <Pencil />
              </Button>
            ) : null}
          </div>
          {readOnly ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Sign in to edit this node.
            </p>
          ) : null}
        </div>

        <fieldset disabled={readOnly} className="contents">

        <div className="space-y-3">
          {onToggleFocusRoot ? (
            <label className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
              <div className="min-w-0">
                <p className="text-sm font-medium">My zone</p>
                <p className="text-xs text-muted-foreground">
                  Open the graph on this problem or solution neighborhood
                </p>
              </div>
              <Switch
                checked={isFocusRoot}
                onCheckedChange={() => onToggleFocusRoot()}
                aria-label="Toggle zone focus"
              />
            </label>
          ) : null}

          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select
              value={draft.type}
              onValueChange={(value) => {
                if (value == null) return;
                updateField("type", value);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
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
              <LocationChips
                locations={draft.locations ?? []}
                draft={locationDraft}
                catalog={locationCatalog}
                onDraftChange={setLocationDraft}
                onAdd={addLocation}
                onRemove={removeLocation}
              />
              <div className="space-y-1.5">
                <Label htmlFor="orgKind">Kind</Label>
                <Input
                  id="orgKind"
                  value={draft.orgKind ?? ""}
                  onChange={(e) => updateField("orgKind", e.target.value)}
                  placeholder="startup, NGO, university"
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
                <Label htmlFor="careerPage">Career page</Label>
                <Input
                  id="careerPage"
                  type="url"
                  inputMode="url"
                  value={draft.careerPage ?? ""}
                  onChange={(e) => updateField("careerPage", e.target.value)}
                  placeholder="https://example.com/careers"
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
              <div className="space-y-1.5">
                <Label htmlFor="orgImageUrl">Image URL</Label>
                <Input
                  id="orgImageUrl"
                  value={draft.imageUrl ?? ""}
                  onChange={(e) => updateField("imageUrl", e.target.value)}
                  placeholder="Logo or LinkedIn image URL"
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
              <LocationChips
                locations={draft.locations ?? []}
                draft={locationDraft}
                catalog={locationCatalog}
                onDraftChange={setLocationDraft}
                onAdd={addLocation}
                onRemove={removeLocation}
              />
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
                <Label htmlFor="imageUrl">Image URL</Label>
                <Input
                  id="imageUrl"
                  value={draft.imageUrl ?? ""}
                  onChange={(e) => updateField("imageUrl", e.target.value)}
                  placeholder="Avatar or LinkedIn image URL"
                />
              </div>
            </>
          )}
        </div>

        <Button
          type="button"
          className="w-full"
          disabled={!dirty || saving}
          aria-busy={saving}
          onClick={() => void handleSave()}
        >
          {saving ? <Loader2 className="animate-spin" /> : null}
          {saving ? "Saving…" : "Save changes"}
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
                    <ConfirmDelete
                      label="Remove relationship"
                      prompt="Remove?"
                      size="icon-xs"
                      className="text-muted-foreground hover:text-destructive"
                      onConfirm={() => onDeleteEdge(edge.id)}
                    />
                  </li>
                );
              })}
            </ul>
          )}

          <div className="space-y-2 rounded-md border p-2">
            <Label className="text-xs" htmlFor="edge-target">
              Add relationship
            </Label>
            <div
              className="relative"
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                  setEdgeOpen(false);
                }
              }}
            >
              <Input
                id="edge-target"
                className="h-8 text-xs"
                placeholder="Type to filter…"
                value={edgeQuery}
                autoComplete="off"
                role="combobox"
                aria-expanded={edgeOpen}
                aria-controls="edge-target-list"
                aria-autocomplete="list"
                onChange={(event) => {
                  setEdgeQuery(event.target.value);
                  setEdgeTarget("");
                  setEdgeOpen(true);
                }}
                onFocus={(event) => {
                  setEdgeOpen(true);
                  event.currentTarget.select();
                }}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    setEdgeOpen(false);
                  }
                }}
              />
              {edgeOpen && (
                <ul
                  id="edge-target-list"
                  role="listbox"
                  className="mt-1 max-h-48 w-full overflow-auto rounded-md border bg-popover p-1 shadow-sm"
                >
                  {connectOptions.length === 0 ? (
                    <li className="px-2 py-1.5 text-xs text-muted-foreground">No matches</li>
                  ) : (
                    connectOptions.map((n) => (
                      <li key={n.id} role="option" aria-selected={edgeTarget === n.id}>
                        <button
                          type="button"
                          className="w-full rounded-sm px-2 py-1.5 text-left text-xs hover:bg-accent"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => {
                            setEdgeTarget(n.id);
                            setEdgeQuery(n.name);
                            setEdgeOpen(false);
                          }}
                        >
                          {n.name}
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              )}
            </div>
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
        </fieldset>
      </div>
    </ScrollArea>
  );
}

function LocationChips({
  locations,
  draft,
  catalog,
  onDraftChange,
  onAdd,
  onRemove,
}: {
  locations: string[];
  draft: string;
  catalog: string[];
  onDraftChange: (value: string) => void;
  onAdd: (value: string) => void;
  onRemove: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor="locations">Locations</Label>
      {locations.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {locations.map((location) => (
            <Badge key={location} variant="secondary" className="pr-1">
              {location}
              <button
                type="button"
                className="rounded-full p-0.5 hover:bg-foreground/10"
                aria-label={`Remove ${location}`}
                onClick={() => onRemove(location)}
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
      <LocationSuggestInput
        id="locations"
        value={draft}
        onChange={onDraftChange}
        onCommit={onAdd}
        catalog={catalog}
        taken={locations}
        placeholder="Add an office, then Enter"
        aria-label="Locations"
      />
    </div>
  );
}
