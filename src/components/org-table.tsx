"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, Plus, Search, SquareArrowOutUpRight, X } from "lucide-react";
import {
  requestCompanyLookup,
  type CompanyProfile,
} from "@/lib/company-fill";
import { NodeRowMarks } from "@/components/node-row-marks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LocationSuggestInput } from "@/components/location-suggest-input";
import { describeLink } from "@/lib/link-display";
import { isHidden } from "@/lib/node-hide";
import { appendLocation, collectLocations } from "@/lib/locations";
import { useLinkTitle } from "@/lib/use-link-title";
import { cn } from "@/lib/utils";
import type { MindMapNode } from "@/types/mindmap";

export type CellSuggestion = {
  id: string;
  label: string;
  company?: string;
  detail?: string;
  value: string;
};

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
  onApplyCompany?: (id: string, profile: CompanyProfile) => string;
  onOpenOnGraph: (id: string) => void;
  onShowHidden?: (id: string) => void;
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
  onApplyCompany,
  onOpenOnGraph,
  onShowHidden,
}: OrgTableProps) {
  const [missingOnly, setMissingOnly] = useState(false);
  const [includeHidden, setIncludeHidden] = useState(false);
  const [query, setQuery] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [focusId, setFocusId] = useState<string | null>(null);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [lookupId, setLookupId] = useState<string | null>(null);
  const [lookupNote, setLookupNote] = useState<Record<string, string>>({});
  const lookupLock = useRef(false);
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
  const hiddenCount = organizations.filter((node) => isHidden(node)).length;
  const listed = organizations.filter(
    (node) => includeHidden || !isHidden(node),
  );

  const needle = query.trim().toLowerCase();
  const rows = listed.filter((node) => {
    if (missingOnly && (node.locations?.length ?? 0) > 0) return false;
    if (needle && !node.name.toLowerCase().includes(needle)) return false;
    return true;
  });

  useEffect(() => {
    if (!focusId) return;
    inputRefs.current.get(focusId)?.focus();
    setFocusId(null);
  }, [focusId]);

  async function lookUp(node: MindMapNode) {
    if (!onApplyCompany || lookupLock.current) return;
    lookupLock.current = true;
    setLookupId(node.id);
    try {
      const result = await requestCompanyLookup({
        name: node.name,
        website: node.website,
      });
      const message = result.ok
        ? onApplyCompany(node.id, result.profile)
        : result.error;
      setLookupNote((prev) => ({ ...prev, [node.id]: message }));
    } catch {
      setLookupNote((prev) => ({
        ...prev,
        [node.id]: "Could not look up that company.",
      }));
    } finally {
      lookupLock.current = false;
      setLookupId(null);
    }
  }

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
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-3 py-1.5">
        <h2 className="text-xs font-medium">Organizations</h2>
        <span className="text-xs text-muted-foreground">
          {rows.length === listed.length
            ? listed.length
            : `${rows.length} of ${listed.length}`}
        </span>
        <Button
          type="button"
          size="xs"
          variant={missingOnly ? "secondary" : "outline"}
          aria-pressed={missingOnly}
          onClick={() => setMissingOnly((current) => !current)}
        >
          Missing location
          <span className="text-muted-foreground">{missingCount}</span>
        </Button>
        <Button
          type="button"
          size="xs"
          variant={includeHidden ? "secondary" : "outline"}
          aria-pressed={includeHidden}
          title="Include organizations hidden on the graph"
          onClick={() => setIncludeHidden((current) => !current)}
        >
          Hidden
          <span className="text-muted-foreground">{hiddenCount}</span>
        </Button>
        <div className="ml-auto w-48">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter by name"
            aria-label="Filter organizations by name"
            className="h-6 text-xs"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-[920px] table-fixed border-collapse text-xs">
          <colgroup>
            <col style={{ width: "16%" }} />
            <col />
            <col style={{ width: "7.5rem" }} />
            <col style={{ width: "12%" }} />
            <col style={{ width: "12%" }} />
            <col style={{ width: "12%" }} />
            <col style={{ width: "12%" }} />
            <col style={{ width: "2.5rem" }} />
          </colgroup>
          <thead className="sticky top-0 z-10 bg-background">
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="px-3 py-1.5 font-medium">Name</th>
              <th className="px-2 py-1.5 font-medium">Locations</th>
              {TEXT_FIELDS.map((field) => (
                <th key={field.key} className="px-2 py-1.5 font-medium">
                  {field.label}
                </th>
              ))}
              <th className="px-2 py-1.5 font-medium">
                <span className="sr-only">Marks</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={3 + TEXT_FIELDS.length}
                  className="px-3 py-8 text-center text-xs text-muted-foreground"
                >
                  {organizations.length === 0
                    ? "No organizations yet."
                    : listed.length === 0
                      ? "Every organization is hidden on the graph."
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
                      "border-b",
                      node.id === selectedNodeId && "bg-muted/50",
                    )}
                  >
                    <td className="px-3 py-1.5">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          className="min-w-0 flex-1 truncate text-left font-medium hover:underline"
                          onClick={() => onOpenOnGraph(node.id)}
                        >
                          {node.name}
                        </button>
                        {onApplyCompany ? (
                          <Button
                            type="button"
                            size="icon-xs"
                            variant="ghost"
                            aria-label={`Look up ${node.name}`}
                            title="Fill website, career page, and logo"
                            disabled={lookupId !== null}
                            onClick={() => void lookUp(node)}
                          >
                            {lookupId === node.id ? (
                              <Loader2 className="animate-spin" />
                            ) : (
                              <Search />
                            )}
                          </Button>
                        ) : null}
                      </div>
                      {lookupNote[node.id] ? (
                        <p
                          className="truncate text-[10px] text-muted-foreground"
                          title={lookupNote[node.id]}
                        >
                          {lookupNote[node.id]}
                        </p>
                      ) : null}
                    </td>
                    <td
                      className="px-2 py-1.5"
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
                        compact
                        value={node[field.key] ?? ""}
                        onCommit={(value) => onPatchField(node.id, field.key, value)}
                      />
                    ))}
                    <td className="px-2 py-1.5 text-right">
                      <NodeRowMarks
                        node={node}
                        onShow={
                          onShowHidden ? () => onShowHidden(node.id) : undefined
                        }
                      />
                    </td>
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

function matchingSuggestions(
  suggestions: CellSuggestion[],
  draft: string,
  saved: string,
): CellSuggestion[] {
  const needle = draft.trim().toLowerCase();
  const pool =
    !needle || needle === saved.trim().toLowerCase()
      ? suggestions
      : suggestions.filter((item) => {
          const haystack = `${item.label} ${item.company ?? ""} ${item.detail ?? ""}`.toLowerCase();
          return haystack.includes(needle);
        });
  return pool.slice(0, 30);
}

export function TextCell({
  value,
  label,
  name,
  field,
  placeholder,
  link,
  compact = false,
  suggestions,
  onCommit,
}: {
  value: string;
  label: string;
  name: string;
  field: string;
  placeholder: string;
  link?: boolean;
  compact?: boolean;
  suggestions?: CellSuggestion[];
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [editing, setEditing] = useState(false);
  const [focused, setFocused] = useState(false);
  const [seenValue, setSeenValue] = useState(value);
  const [highlight, setHighlight] = useState(0);
  const [armed, setArmed] = useState(false);
  const [box, setBox] = useState<DOMRect | null>(null);
  const skipCommit = useRef<"revert" | "keep" | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const matches = suggestions ? matchingSuggestions(suggestions, draft, value) : [];
  const suggestOpen = focused && matches.length > 0;
  const activeIndex = Math.min(highlight, Math.max(matches.length - 1, 0));

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

  useEffect(() => {
    const element = inputRef.current;
    if (!suggestOpen || !element) return;
    function place() {
      const next = inputRef.current?.getBoundingClientRect();
      if (next) setBox(next);
    }
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [suggestOpen, matches.length]);

  function commit(raw: string) {
    const next = raw.trim();
    if (next !== value.trim()) onCommit(next);
  }

  function pickSuggestion(suggestion: CellSuggestion) {
    skipCommit.current = "keep";
    setDraft(suggestion.value);
    commit(suggestion.value);
    setEditing(false);
    setFocused(false);
    inputRef.current?.blur();
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
          onChange={(event) => {
            setDraft(event.target.value);
            setHighlight(0);
            setArmed(false);
          }}
          onFocus={() => {
            setFocused(true);
          }}
          onBlur={(event) => {
            setFocused(false);
            if (skipCommit.current === "revert") {
              skipCommit.current = null;
              setDraft(value);
              setEditing(false);
              return;
            }
            if (skipCommit.current === "keep") {
              skipCommit.current = null;
              setEditing(false);
              return;
            }
            commit(event.currentTarget.value);
            setEditing(false);
          }}
          onKeyDown={(event) => {
            if (suggestOpen && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
              event.preventDefault();
              const delta = event.key === "ArrowDown" ? 1 : -1;
              if (!armed) {
                setArmed(true);
                setHighlight(delta === 1 ? 0 : matches.length - 1);
                return;
              }
              setHighlight((current) => {
                const index = Math.min(current, matches.length - 1);
                return (index + delta + matches.length) % matches.length;
              });
              return;
            }
            if (event.key === "Enter") {
              event.preventDefault();
              const typed = event.currentTarget.value.trim().toLowerCase();
              const exact = matches.filter((item) => item.label.toLowerCase() === typed);
              const selected = exact.length === 1 ? exact[0] : armed ? matches[activeIndex] : undefined;
              if (selected) {
                pickSuggestion(selected);
                return;
              }
              const row = event.currentTarget.closest("tr");
              event.currentTarget.blur();
              focusNext(row);
              return;
            }
            if (event.key === "Escape") {
              skipCommit.current = "revert";
              setDraft(value);
              event.currentTarget.blur();
            }
          }}
        />
      )}
      {suggestOpen && box
        ? createPortal(
            <div
              ref={panelRef}
              role="listbox"
              aria-label={`Jobs for ${name}`}
              className="fixed z-50 max-h-48 w-72 overflow-auto rounded-md border bg-popover p-1 text-xs text-popover-foreground shadow-md"
              style={{
                left: Math.max(8, Math.min(box.left, window.innerWidth - 296)),
                top:
                  box.bottom + 4 + 200 > window.innerHeight && box.top > 200
                    ? box.top - 4
                    : box.bottom + 4,
                transform:
                  box.bottom + 4 + 200 > window.innerHeight && box.top > 200
                    ? "translateY(-100%)"
                    : undefined,
              }}
            >
              {matches.map((suggestion, index) => (
                <button
                  key={suggestion.id}
                  type="button"
                  role="option"
                  aria-selected={armed && index === activeIndex}
                  className={cn(
                    "flex w-full flex-col items-start rounded-sm px-2 py-1.5 text-left hover:bg-muted",
                    armed && index === activeIndex && "bg-muted",
                  )}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => {
                    setHighlight(index);
                    setArmed(true);
                  }}
                  onClick={() => pickSuggestion(suggestion)}
                >
                  <span className="w-full truncate font-medium" title={suggestion.label}>
                    {suggestion.label}
                  </span>
                  {suggestion.company ? (
                    <span className="w-full truncate" title={suggestion.company}>
                      {suggestion.company}
                    </span>
                  ) : null}
                  {suggestion.detail ? (
                    <span className="w-full truncate text-muted-foreground">
                      {suggestion.detail}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
    </td>
  );
}
