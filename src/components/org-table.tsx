"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, SquareArrowOutUpRight, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LocationSuggestInput } from "@/components/location-suggest-input";
import { describeLink } from "@/lib/link-display";
import { appendLocation, collectLocations } from "@/lib/locations";
import { useLinkTitle } from "@/lib/use-link-title";
import { cn } from "@/lib/utils";
import type { MindMapNode } from "@/types/mindmap";

type OrgTextKey = "orgKind" | "website" | "careerPage" | "orgEmail" | "linkedIn";

const TEXT_FIELDS: {
  key: OrgTextKey;
  label: string;
  placeholder: string;
  link?: boolean;
}[] = [
  { key: "orgKind", label: "Kind", placeholder: "NGO, startup" },
  { key: "website", label: "Website", placeholder: "https://", link: true },
  { key: "careerPage", label: "Career page", placeholder: "Careers URL", link: true },
  { key: "orgEmail", label: "Email", placeholder: "Email" },
  { key: "linkedIn", label: "LinkedIn", placeholder: "LinkedIn", link: true },
];

type OrgTableProps = {
  nodes: MindMapNode[];
  selectedNodeId: string | null;
  onChangeLocations: (
    id: string,
    update: (current: string[]) => string[],
  ) => void;
  onPatchField: (id: string, key: OrgTextKey, value: string) => void;
  onOpenOnGraph: (id: string) => void;
};

function SiteFavicon({ host, compact }: { host: string; compact?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-sm bg-muted font-semibold text-muted-foreground",
          compact ? "size-3 text-[7px]" : "size-3.5 text-[8px]",
        )}
      >
        {host.charAt(0).toUpperCase()}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- remote site favicons
    <img
      src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=32`}
      alt=""
      width={compact ? 12 : 14}
      height={compact ? 12 : 14}
      className={cn("shrink-0 rounded-sm", compact ? "size-3" : "size-3.5")}
      draggable={false}
      onError={() => setFailed(true)}
    />
  );
}

export function OrgTable({
  nodes,
  selectedNodeId,
  onChangeLocations,
  onPatchField,
  onOpenOnGraph,
}: OrgTableProps) {
  const [missingOnly, setMissingOnly] = useState(false);
  const [query, setQuery] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [focusId, setFocusId] = useState<string | null>(null);
  const [addingId, setAddingId] = useState<string | null>(null);
  const inputRefs = useRef(new Map<string, HTMLInputElement>());

  const locationCatalog = useMemo(() => collectLocations(nodes), [nodes]);

  const organizations = useMemo(
    () =>
      nodes
        .filter((node) => node.type === "organization")
        .sort((a, b) => a.name.localeCompare(b.name)),
    [nodes],
  );

  const missingCount = organizations.filter(
    (node) => (node.locations?.length ?? 0) === 0,
  ).length;

  const needle = query.trim().toLowerCase();
  const rows = organizations.filter((node) => {
    if (missingOnly && (node.locations?.length ?? 0) > 0) return false;
    if (needle && !node.name.toLowerCase().includes(needle)) return false;
    return true;
  });

  useEffect(() => {
    if (!focusId) return;
    inputRefs.current.get(focusId)?.focus();
    setFocusId(null);
  }, [focusId]);

  function setDraft(id: string, value: string) {
    setDrafts((prev) => ({ ...prev, [id]: value }));
  }

  function addLocation(node: MindMapNode, raw: string) {
    if (!raw.trim()) return;
    setDraft(node.id, "");
    if (!appendLocation(node.locations, raw)) return;
    const willLeaveList = missingOnly && (node.locations?.length ?? 0) === 0;
    if (willLeaveList) {
      const index = rows.findIndex((row) => row.id === node.id);
      const following = rows[index + 1]?.id ?? rows[index - 1]?.id;
      if (following) openAdder(following);
    }
    onChangeLocations(node.id, (current) => appendLocation(current, raw) ?? current);
  }

  function removeLocation(node: MindMapNode, value: string) {
    onChangeLocations(node.id, (current) =>
      current.filter((item) => item !== value),
    );
  }

  function openAdder(id: string) {
    setAddingId(id);
    setFocusId(id);
  }

  function moveFocus(id: string, delta: number) {
    const index = rows.findIndex((row) => row.id === id);
    const next = rows[index + delta];
    if (next) openAdder(next.id);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-3 py-2">
        <h2 className="text-sm font-medium">Organizations</h2>
        <span className="text-xs text-muted-foreground">
          {rows.length === organizations.length
            ? organizations.length
            : `${rows.length} of ${organizations.length}`}
        </span>
        <Button
          type="button"
          size="sm"
          variant={missingOnly ? "secondary" : "outline"}
          aria-pressed={missingOnly}
          onClick={() => setMissingOnly((current) => !current)}
        >
          Missing location
          <span className="text-muted-foreground">{missingCount}</span>
        </Button>
        <div className="ml-auto w-48">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter by name"
            aria-label="Filter organizations by name"
            className="h-7 text-xs"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-[1100px] border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-background">
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="w-[16%] px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Locations</th>
              {TEXT_FIELDS.map((field) => (
                <th key={field.key} className="w-[14%] px-2 py-2 font-medium">
                  {field.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={2 + TEXT_FIELDS.length}
                  className="px-3 py-10 text-center text-sm text-muted-foreground"
                >
                  {organizations.length === 0
                    ? "No organizations yet."
                    : missingOnly && !needle
                      ? "Every organization has a location."
                      : "No organizations match this filter."}
                </td>
              </tr>
            ) : (
              rows.map((node) => {
                const locations = node.locations ?? [];
                const draft = drafts[node.id] ?? "";
                return (
                  <tr
                    key={node.id}
                    className={cn(
                      "border-b align-top",
                      node.id === selectedNodeId && "bg-muted/50",
                    )}
                  >
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        className="text-left font-medium hover:underline"
                        onClick={() => onOpenOnGraph(node.id)}
                      >
                        {node.name}
                      </button>
                    </td>
                    <td
                      className="px-3 py-1.5"
                      onMouseDown={(event) => {
                        const target = event.target as HTMLElement;
                        if (target.closest("button, input")) return;
                        event.preventDefault();
                        openAdder(node.id);
                      }}
                    >
                      <div className="flex flex-wrap items-center gap-1.5">
                        {locations.map((location) => (
                          <Badge
                            key={location}
                            variant="secondary"
                            className="relative"
                          >
                            {location}
                            <button
                              type="button"
                              className="absolute inset-y-0 right-0 flex w-7 items-center justify-end bg-[linear-gradient(to_right,transparent,var(--secondary)_46%,var(--secondary))] pr-1 opacity-0 transition-opacity group-hover/badge:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
                              aria-label={`Remove ${location} from ${node.name}`}
                              onClick={() => removeLocation(node, location)}
                            >
                              <X className="size-3" />
                            </button>
                          </Badge>
                        ))}
                        {addingId === node.id ? (
                          <LocationSuggestInput
                            value={draft}
                            onChange={(value) => setDraft(node.id, value)}
                            onCommit={(value) => addLocation(node, value)}
                            catalog={locationCatalog}
                            taken={locations}
                            aria-label={`Add location for ${node.name}`}
                            placeholder="Add location"
                            className="h-5 rounded-full border-0 bg-transparent px-1 text-xs shadow-none focus-visible:ring-0 md:text-xs dark:bg-transparent"
                            wrapperClassName="w-36"
                            inputRef={(element) => {
                              if (element) inputRefs.current.set(node.id, element);
                              else inputRefs.current.delete(node.id);
                            }}
                            onEmptyBackspace={() => {
                              const last = locations[locations.length - 1];
                              if (last) removeLocation(node, last);
                            }}
                            onNavigate={(delta) => moveFocus(node.id, delta)}
                            onDismiss={() => {
                              setAddingId((current) =>
                                current === node.id ? null : current,
                              );
                            }}
                          />
                        ) : (
                          <button
                            type="button"
                            aria-label={`Add location for ${node.name}`}
                            className="inline-flex size-5 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            onClick={() => openAdder(node.id)}
                          >
                            <Plus className="size-3" />
                          </button>
                        )}
                      </div>
                    </td>
                    {TEXT_FIELDS.map((field) => (
                      <TextCell
                        key={field.key}
                        field={field.key}
                        label={field.label}
                        name={node.name}
                        placeholder={field.placeholder}
                        link={field.link}
                        value={node[field.key] ?? ""}
                        onCommit={(value) => onPatchField(node.id, field.key, value)}
                      />
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function TextCell({
  value,
  label,
  name,
  field,
  placeholder,
  link,
  compact = false,
  onCommit,
}: {
  value: string;
  label: string;
  name: string;
  field: string;
  placeholder: string;
  link?: boolean;
  compact?: boolean;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [editing, setEditing] = useState(false);
  const [focused, setFocused] = useState(false);
  const [seenValue, setSeenValue] = useState(value);
  const skipCommit = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  if (value !== seenValue) {
    setSeenValue(value);
    if (!focused) setDraft(value);
  }

  const presentation = link ? describeLink(value) : null;
  const showPretty = Boolean(presentation) && !editing;
  const fetchedTitle = useLinkTitle(
    showPretty && presentation && !presentation.linkedIn ? presentation.href : null,
  );
  const linkLabel = fetchedTitle || presentation?.label || "";

  useEffect(() => {
    if (!editing) return;
    const element = inputRef.current;
    if (!element) return;
    element.focus();
    element.select();
  }, [editing]);

  function commit(raw: string) {
    const next = raw.trim();
    if (next !== value.trim()) onCommit(next);
  }

  function focusNext(row: HTMLTableRowElement | null) {
    const next = row?.nextElementSibling?.querySelector(`[data-field="${field}"]`);
    if (next instanceof HTMLButtonElement) next.click();
    else if (next instanceof HTMLInputElement) next.focus();
  }

  return (
    <td className="px-2 py-1">
      {showPretty && presentation ? (
        <span className="inline-flex min-w-0 max-w-full items-center">
          <button
            type="button"
            data-field={field}
            title={value}
            aria-label={`Edit ${label} for ${name}`}
            className={cn(
              "flex min-w-0 cursor-text items-center rounded-md pl-1 text-left hover:bg-muted/60",
              compact ? "h-6 gap-1 text-xs" : "h-7 gap-1.5 text-sm",
            )}
            onClick={() => {
              setFocused(true);
              setEditing(true);
            }}
          >
            <SiteFavicon host={presentation.host} compact={compact} />
            <span className={cn("min-w-0 max-w-44 truncate", compact ? "text-xs" : "text-sm")}>
              {linkLabel}
            </span>
          </button>
          <a
            href={presentation.href}
            target="_blank"
            rel="noreferrer"
            tabIndex={-1}
            aria-label={`Open ${label} for ${name}`}
            title="Open link"
            className={cn(
              "inline-flex shrink-0 items-center justify-center text-muted-foreground hover:text-foreground",
              compact ? "size-5" : "size-6",
            )}
          >
            <SquareArrowOutUpRight className={compact ? "size-3" : "size-3.5"} />
          </a>
        </span>
      ) : (
        <input
          ref={inputRef}
          data-field={field}
          value={draft}
          aria-label={`${label} for ${name}`}
          placeholder={placeholder}
          className={cn(
            "w-full min-w-28 bg-transparent px-1 outline-none placeholder:text-muted-foreground focus:bg-muted/50",
            compact ? "h-6 text-xs" : "h-7 text-sm",
          )}
          onChange={(event) => setDraft(event.target.value)}
          onFocus={() => {
            setFocused(true);
          }}
          onBlur={(event) => {
            setFocused(false);
            if (skipCommit.current) {
              skipCommit.current = false;
              setDraft(value);
              setEditing(false);
              return;
            }
            commit(event.currentTarget.value);
            setEditing(false);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              const row = event.currentTarget.closest("tr");
              event.currentTarget.blur();
              focusNext(row);
              return;
            }
            if (event.key === "Escape") {
              skipCommit.current = true;
              setDraft(value);
              event.currentTarget.blur();
            }
          }}
        />
      )}
    </td>
  );
}
