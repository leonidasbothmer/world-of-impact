"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LocationSuggestInput } from "@/components/location-suggest-input";
import { appendLocation, collectLocations } from "@/lib/locations";
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

function websiteHref(value: string): string {
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value}`;
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
      if (following) setFocusId(following);
    }
    onChangeLocations(node.id, (current) => appendLocation(current, raw) ?? current);
  }

  function removeLocation(node: MindMapNode, value: string) {
    onChangeLocations(node.id, (current) =>
      current.filter((item) => item !== value),
    );
  }

  function moveFocus(id: string, delta: number) {
    const index = rows.findIndex((row) => row.id === id);
    const next = rows[index + delta];
    if (next) setFocusId(next.id);
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
                        inputRefs.current.get(node.id)?.focus();
                      }}
                    >
                      <div className="flex flex-wrap items-center gap-1.5">
                        {locations.map((location) => (
                          <Badge
                            key={location}
                            variant="secondary"
                            className="pr-1"
                          >
                            {location}
                            <button
                              type="button"
                              className="rounded-full p-0.5 hover:bg-foreground/10"
                              aria-label={`Remove ${location} from ${node.name}`}
                              onClick={() => removeLocation(node, location)}
                            >
                              <X className="size-3" />
                            </button>
                          </Badge>
                        ))}
                        <LocationSuggestInput
                          value={draft}
                          onChange={(value) => setDraft(node.id, value)}
                          onCommit={(value) => addLocation(node, value)}
                          catalog={locationCatalog}
                          taken={locations}
                          aria-label={`Add location for ${node.name}`}
                          placeholder="Add location"
                          className="h-7 border-0 bg-transparent px-1 shadow-none focus-visible:ring-0"
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
                        />
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

function TextCell({
  value,
  label,
  name,
  field,
  placeholder,
  link,
  onCommit,
}: {
  value: string;
  label: string;
  name: string;
  field: string;
  placeholder: string;
  link?: boolean;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const focused = useRef(false);
  const skipCommit = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const commitRef = useRef(onCommit);
  const savedRef = useRef(value);
  commitRef.current = onCommit;
  savedRef.current = value;

  useEffect(() => {
    if (!focused.current) setDraft(value);
  }, [value]);

  useEffect(() => {
    const element = inputRef.current;
    if (!element) return;
    const field = element;
    function onFocus() {
      focused.current = true;
    }
    function onBlur() {
      focused.current = false;
      if (skipCommit.current) {
        skipCommit.current = false;
        return;
      }
      const next = field.value.trim();
      if (next !== savedRef.current.trim()) commitRef.current(next);
    }
    element.addEventListener("focus", onFocus);
    element.addEventListener("blur", onBlur);
    return () => {
      element.removeEventListener("focus", onFocus);
      element.removeEventListener("blur", onBlur);
    };
  }, []);

  return (
    <td className="px-2 py-1">
      <div className="flex items-center gap-1">
        <input
          ref={inputRef}
          data-field={field}
          value={draft}
          aria-label={`${label} for ${name}`}
          placeholder={placeholder}
          className="h-7 min-w-28 flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-muted-foreground focus:bg-muted/50"
          onChange={(event) => setDraft(event.target.value)}
          onFocus={() => {
            focused.current = true;
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              const row = event.currentTarget.closest("tr");
              const next = row?.nextElementSibling?.querySelector(
                `input[data-field="${field}"]`,
              );
              event.currentTarget.blur();
              if (next instanceof HTMLInputElement) next.focus();
              return;
            }
            if (event.key === "Escape") {
              skipCommit.current = true;
              setDraft(value);
              event.currentTarget.blur();
            }
          }}
        />
        {link && value ? (
          <a
            href={field === "orgEmail" ? `mailto:${value}` : websiteHref(value)}
            target="_blank"
            rel="noreferrer"
            tabIndex={-1}
            aria-label={`Open ${label} for ${name}`}
            className="shrink-0 text-muted-foreground hover:text-foreground"
          >
            <ExternalLink className="size-3" />
          </a>
        ) : null}
      </div>
    </td>
  );
}
