"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Archive, ArchiveRestore, Check, ChevronLeft, ChevronRight, X } from "lucide-react";
import {
  ApplicationChartSection,
  type ActivityDateRange,
} from "@/components/application-chart";
import { ConfirmDelete } from "@/components/confirm-delete";
import { FilterChip } from "@/components/filter-chip";
import { TextCell, type CellSuggestion } from "@/components/org-table";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  TRACK_STATUSES,
  isTracked,
  readTrackState,
  calendarDate,
  formatTrackDate,
  formatTrackDateRange,
  shownTrackStatus,
  trackClosedOn,
  type TrackStatus,
} from "@/lib/tracking";
import type { JobRow } from "@/lib/use-job-board";
import { cn } from "@/lib/utils";
import type { MindMapEdge, MindMapNode } from "@/types/mindmap";

export type TrackerLinkPatch = {
  linkedIn?: string;
  imageUrl?: string;
  /** Ignore a late photo fetch if the LinkedIn field has since changed. */
  onlyIfLinkedIn?: string;
};

type JobTrackerProps = {
  nodes: MindMapNode[];
  edges: MindMapEdge[];
  selectedNodeId: string | null;
  onOpenOnGraph: (id: string) => void;
  onSetTracked: (id: string, tracked: boolean) => void;
  onSetStatus: (id: string, status: TrackStatus) => void;
  onSetArchived: (id: string, archived: boolean) => void;
  onSetRole: (id: string, role: string) => void;
  onSetDate: (id: string, field: "appliedOn" | "closedOn", value: string) => void;
  onPatchLink: (id: string, patch: TrackerLinkPatch) => void;
  /** Open roles scraped from career pages, used to suggest a position. */
  jobs?: JobRow[];
};

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function TrackerAvatar({
  name,
  imageUrl,
  rounded,
  className,
}: {
  name: string;
  imageUrl?: string;
  rounded: "full" | "md";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex size-5 shrink-0 items-center justify-center overflow-hidden border bg-muted",
        rounded === "full" ? "rounded-full" : "rounded-md",
        className,
      )}
    >
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- remote LinkedIn/OG hotlinks by design
        <img
          src={imageUrl}
          alt=""
          className="size-full object-cover"
          draggable={false}
          referrerPolicy="no-referrer"
        />
      ) : (
        <span className="text-[8px] font-semibold leading-none text-muted-foreground">
          {initials(name) || "?"}
        </span>
      )}
    </span>
  );
}

function roleHref(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || /\s/.test(trimmed)) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^[^\s]+\.[^\s]{2,}/.test(trimmed)) return `https://${trimmed}`;
  return null;
}

function connectedPeople(
  nodes: MindMapNode[],
  edges: MindMapEdge[],
): Map<string, MindMapNode[]> {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const grouped = new Map<string, MindMapNode[]>();
  for (const edge of edges) {
    const source = byId.get(edge.source);
    const target = byId.get(edge.target);
    if (!source || !target) continue;
    const organization =
      source.type === "organization"
        ? source
        : target.type === "organization"
          ? target
          : null;
    const person =
      source.type === "person"
        ? source
        : target.type === "person"
          ? target
          : null;
    if (!organization || !person) continue;
    const list = grouped.get(organization.id) ?? [];
    if (!list.some((item) => item.id === person.id)) list.push(person);
    grouped.set(organization.id, list);
  }
  for (const list of grouped.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name));
  }
  return grouped;
}

export function JobTracker({
  nodes,
  edges,
  selectedNodeId,
  onOpenOnGraph,
  onSetTracked,
  onSetStatus,
  onSetArchived,
  onSetRole,
  onSetDate,
  onPatchLink,
  jobs = [],
}: JobTrackerProps) {
  const [query, setQuery] = useState("");
  const [dateRange, setDateRange] = useState<ActivityDateRange | null>(null);
  const [statuses, setStatuses] = useState<TrackStatus[]>([]);
  const [addQuery, setAddQuery] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [archivedOpen, setArchivedOpen] = useState(false);

  function applyDateRange(next: ActivityDateRange | null) {
    setDateRange((current) => {
      if (next == null) return current == null ? current : null;
      if (current && current.from === next.from && current.to === next.to) return current;
      return next;
    });
  }

  function setStatus(id: string, status: TrackStatus) {
    onSetStatus(id, status);
    if (status === "denied") setArchivedOpen(true);
  }

  const organizations = useMemo(() => {
    const tracked = nodes
      .filter((node) => node.type === "organization" && isTracked(node))
      .sort((a, b) => a.name.localeCompare(b.name));
    const active: MindMapNode[] = [];
    const archived: MindMapNode[] = [];
    for (const node of tracked) {
      if (readTrackState(node)?.archived) archived.push(node);
      else active.push(node);
    }
    return { active, archived };
  }, [nodes]);
  const peopleByOrg = useMemo(
    () => connectedPeople(nodes, edges),
    [nodes, edges],
  );
  const jobsByOrg = useMemo(() => {
    const grouped = new Map<string, CellSuggestion[]>();
    const lists = new Map<string, JobRow[]>();
    for (const job of jobs) {
      const list = lists.get(job.organizationId) ?? [];
      list.push(job);
      lists.set(job.organizationId, list);
    }
    for (const [id, list] of lists) {
      list.sort((a, b) => a.title.localeCompare(b.title));
      grouped.set(
        id,
        list.map((job) => ({
          id: job.id,
          label: job.title,
          company: job.organizationName || undefined,
          detail: [job.location, job.department].filter(Boolean).join(" · ") || undefined,
          value: job.url,
        })),
      );
    }
    return grouped;
  }, [jobs]);

  const needle = query.trim().toLowerCase();
  function matchesQuery(node: MindMapNode) {
    if (!needle) return true;
    return (
      node.name.toLowerCase().includes(needle) ||
      (node.linkedIn ?? "").toLowerCase().includes(needle)
    );
  }
  function matchesFilters(node: MindMapNode) {
    return (
      matchesQuery(node) &&
      matchesTrackDate(node, dateRange) &&
      matchesTrackStatus(node, statuses)
    );
  }
  const orgRows = organizations.active.filter(matchesFilters);
  const archivedRows = organizations.archived.filter(matchesFilters);

  const addNeedle = addQuery.trim().toLowerCase();
  const addMatches = useMemo(() => {
    if (!addNeedle) return [];
    return nodes
      .filter(
        (node) =>
          node.type === "organization" &&
          !isTracked(node) &&
          node.name.toLowerCase().includes(addNeedle),
      )
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 8);
  }, [nodes, addNeedle]);

  async function commitLinkedIn(id: string, value: string) {
    const trimmed = value.trim();
    onPatchLink(id, { linkedIn: trimmed });
    if (!trimmed) return;
    try {
      const response = await fetch(
        `/api/linkedin-preview?url=${encodeURIComponent(trimmed)}`,
      );
      if (!response.ok) return;
      const body = (await response.json()) as {
        linkedIn?: string;
        imageUrl?: string;
      };
      if (!body.imageUrl && !body.linkedIn) return;
      onPatchLink(id, {
        linkedIn: body.linkedIn || trimmed,
        ...(body.imageUrl ? { imageUrl: body.imageUrl } : {}),
        onlyIfLinkedIn: trimmed,
      });
    } catch {
      // The link is already saved. A failed preview just leaves the photo empty.
    }
  }

  const total = organizations.active.length;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-3 py-1.5">
        <h2 className="text-xs font-medium">Job tracker</h2>
        <span className="text-xs text-muted-foreground">
          {orgRows.length === total ? total : `${orgRows.length} of ${total}`}
        </span>
        <div className="relative w-52">
            <Input
              value={addQuery}
              onChange={(event) => {
                setAddQuery(event.target.value);
                setAddOpen(true);
              }}
              onFocus={() => setAddOpen(true)}
              onBlur={() => {
                window.setTimeout(() => setAddOpen(false), 120);
              }}
              placeholder="Add organization"
              aria-label="Add an organization to the job tracker"
              className="h-6 text-xs"
            />
            {addOpen && addMatches.length > 0 ? (
              <ul className="absolute top-full right-0 left-0 z-20 mt-1 max-h-48 overflow-auto rounded-md border bg-popover p-1 shadow-md">
                {addMatches.map((node) => (
                  <li key={node.id}>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs hover:bg-muted"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        onSetTracked(node.id, true);
                        setAddQuery("");
                        setAddOpen(false);
                      }}
                    >
                      <TrackerAvatar
                        name={node.name}
                        imageUrl={node.imageUrl}
                        rounded="md"
                      />
                      {node.name}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        <div className="ml-auto flex items-center gap-1">
          <StatusFilter value={statuses} onChange={setStatuses} />
          <DateRangeFilter value={dateRange} onChange={applyDateRange} />
          <div className="ml-1 w-48">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter by name"
              aria-label="Filter tracked organizations by name"
              className="h-6 text-xs"
            />
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-[920px] table-fixed border-collapse text-xs">
          <colgroup>
            <col style={{ width: "18%" }} />
            <col style={{ width: "8.25rem" }} />
            <col style={{ width: "5.5rem" }} />
            <col style={{ width: "16%" }} />
            <col style={{ width: "7.75rem" }} />
            <col style={{ width: "7.75rem" }} />
            <col />
            <col style={{ width: "3.75rem" }} />
          </colgroup>
          <thead className="sticky top-0 z-10 bg-background">
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="px-3 py-1.5 font-medium">Name</th>
              <th className="px-2 py-1.5 font-medium">Status</th>
              <th className="px-2 py-1.5 font-medium">People</th>
              <th className="px-2 py-1.5 font-medium">Position</th>
              <th className="px-2 py-1.5 font-medium">Applied</th>
              <th className="px-2 py-1.5 font-medium" title="Date the process moved to the talent pool or was denied">
                Closed
              </th>
              <th className="px-2 py-1.5 font-medium">LinkedIn</th>
              <th className="px-2 py-1.5 font-medium">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {orgRows.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="px-3 py-8 text-center text-xs text-muted-foreground"
                >
                  {organizations.active.length + organizations.archived.length === 0
                    ? "Nothing tracked yet. Add an organization above."
                    : needle || dateRange || statuses.length > 0
                      ? "No organizations match this filter."
                      : "No open applications."}
                </td>
              </tr>
            ) : (
              orgRows.map((node) => (
                <TrackerRow
                  key={node.id}
                  node={node}
                  selected={node.id === selectedNodeId}
                  archived={false}
                  onOpenOnGraph={onOpenOnGraph}
                  onSetTracked={onSetTracked}
                  onSetStatus={setStatus}
                  onSetArchived={onSetArchived}
                  onSetRole={onSetRole}
                  onSetDate={onSetDate}
                  people={peopleByOrg.get(node.id) ?? []}
                  suggestions={jobsByOrg.get(node.id) ?? []}
                  onCommitLinkedIn={(value) => {
                    void commitLinkedIn(node.id, value);
                  }}
                />
              ))
            )}
            {archivedRows.length > 0 ? (
              <tr className="border-b">
                <td colSpan={8} className="p-0">
                  <button
                    type="button"
                    className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-xs font-medium text-muted-foreground hover:bg-muted/50"
                    aria-expanded={archivedOpen}
                    onClick={() => setArchivedOpen((open) => !open)}
                  >
                    <ChevronRight
                      className={cn(
                        "size-3.5 transition-transform",
                        archivedOpen && "rotate-90",
                      )}
                    />
                    Archived
                    <span>{archivedRows.length}</span>
                  </button>
                </td>
              </tr>
            ) : null}
            {archivedOpen
              ? archivedRows.map((node) => (
                  <TrackerRow
                    key={node.id}
                    node={node}
                    selected={node.id === selectedNodeId}
                    archived
                    onOpenOnGraph={onOpenOnGraph}
                    onSetTracked={onSetTracked}
                    onSetStatus={setStatus}
                    onSetArchived={onSetArchived}
                    onSetRole={onSetRole}
                    onSetDate={onSetDate}
                    people={peopleByOrg.get(node.id) ?? []}
                    suggestions={jobsByOrg.get(node.id) ?? []}
                    onCommitLinkedIn={(value) => {
                      void commitLinkedIn(node.id, value);
                    }}
                  />
                ))
              : null}
          </tbody>
        </table>
      </div>
      <ApplicationChartSection
        nodes={nodes}
        dateRange={dateRange}
        onDateRange={applyDateRange}
      />
    </div>
  );
}

function TrackerRow({
  node,
  selected,
  archived,
  people,
  suggestions,
  onOpenOnGraph,
  onSetTracked,
  onSetStatus,
  onSetArchived,
  onSetRole,
  onSetDate,
  onCommitLinkedIn,
}: {
  node: MindMapNode;
  selected: boolean;
  archived: boolean;
  people: MindMapNode[];
  suggestions: CellSuggestion[];
  onOpenOnGraph: (id: string) => void;
  onSetTracked: (id: string, tracked: boolean) => void;
  onSetStatus: (id: string, status: TrackStatus) => void;
  onSetArchived: (id: string, archived: boolean) => void;
  onSetRole: (id: string, role: string) => void;
  onSetDate: (id: string, field: "appliedOn" | "closedOn", value: string) => void;
  onCommitLinkedIn: (value: string) => void;
}) {
  const state = readTrackState(node);
  const shown = state ? shownTrackStatus(state) : "todo";
  const status = TRACK_STATUSES.find((item) => item.value === shown);
  const role = state?.role ?? "";
  const stale =
    shown === "followup" && state?.status === "running";

  return (
    <tr className={cn("border-b align-middle", selected && "bg-muted/50")}>
      <td className="px-3 py-1">
        <button
          type="button"
          className="flex items-center gap-1.5 text-left font-medium hover:underline"
          onClick={() => onOpenOnGraph(node.id)}
        >
          <TrackerAvatar
            name={node.name}
            imageUrl={node.imageUrl}
            rounded="md"
          />
          {node.name}
        </button>
      </td>
      <td className="px-2 py-1">
          <Select
            value={shown}
            onValueChange={(value) => {
              if (value == null || !isTrackStatus(value)) return;
              onSetStatus(node.id, value);
            }}
          >
            <SelectTrigger
              size="xs"
              className={cn("w-full", status?.chip)}
              title={
                stale
                  ? "In progress for three weeks with no response. Get back to them."
                  : undefined
              }
              aria-label={`Status for ${node.name}`}
            >
              <SelectValue>
                <span className={cn("size-1.5 rounded-full", status?.dot)} />
                {status?.label}
              </SelectValue>
            </SelectTrigger>
            <SelectContent align="start" alignItemWithTrigger={false} className="text-xs">
              {TRACK_STATUSES.map((item) => (
                <SelectItem key={item.value} value={item.value} className="py-1 text-xs">
                  <span className={cn("size-1.5 rounded-full", item.dot)} />
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </td>
      <td className="px-2 py-1">
          {people.length === 0 ? (
            <span className="text-xs text-muted-foreground">—</span>
          ) : (
            <div className="flex items-center pl-1">
              {people.map((person) => (
                <button
                  key={person.id}
                  type="button"
                  className="group relative -ml-1.5 rounded-full ring-2 ring-background first:ml-0"
                  aria-label={person.name}
                  onClick={() => onOpenOnGraph(person.id)}
                >
                  <TrackerAvatar
                    name={person.name}
                    imageUrl={person.imageUrl}
                    rounded="full"
                    className="size-4 border-0"
                  />
                  <span className="pointer-events-none absolute top-full left-1/2 z-20 mt-1 hidden -translate-x-1/2 whitespace-nowrap rounded bg-foreground px-1.5 py-0.5 text-[10px] font-medium text-background group-hover:block group-focus-visible:block">
                    {person.name}
                  </span>
                </button>
              ))}
            </div>
          )}
        </td>
      <TextCell
          field="role"
          label="Position"
          name={node.name}
          placeholder="Link or speculative"
          link={Boolean(roleHref(role))}
          value={role}
          compact
          suggestions={suggestions}
          onCommit={(value) => onSetRole(node.id, value)}
        />
      <TrackDateCell
          value={state?.appliedOn}
          label="Applied date"
          name={node.name}
          onChange={(value) => onSetDate(node.id, "appliedOn", value)}
        />
      {state && (state.status === "pool" || state.status === "denied") ? (
        <TrackDateCell
          value={trackClosedOn(state)}
          label="Closed"
          name={node.name}
          onChange={(value) => onSetDate(node.id, "closedOn", value)}
        />
      ) : (
        <td className="px-2 py-1">
          <span className="flex h-6 items-center text-xs text-muted-foreground">
            {state?.status === "running" || state?.status === "followup"
              ? "Running"
              : "—"}
          </span>
        </td>
      )}
      <TextCell
        field="linkedIn"
        label="LinkedIn"
        name={node.name}
        placeholder="LinkedIn"
        link
        value={node.linkedIn ?? ""}
        compact
        onCommit={onCommitLinkedIn}
      />
      <td className="px-2 py-1">
          <div className="relative flex w-full items-center justify-end">
            <button
              type="button"
              className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label={
                archived
                  ? `Restore ${node.name} from the archive`
                  : `Archive ${node.name}`
              }
              onClick={() => onSetArchived(node.id, !archived)}
            >
              {archived ? (
                <ArchiveRestore className="size-3" />
              ) : (
                <Archive className="size-3" />
              )}
            </button>
            <ConfirmDelete
              label={`Remove ${node.name} from the job tracker`}
              prompt="Remove?"
              size="icon-xs"
              overlay
              icon={<X />}
              className="text-muted-foreground"
              onConfirm={() => onSetTracked(node.id, false)}
            />
          </div>
        </td>
    </tr>
  );
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

function parseCalendarDate(value: string | undefined): Date | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (
    date.getFullYear() !== Number(match[1]) ||
    date.getMonth() !== Number(match[2]) - 1 ||
    date.getDate() !== Number(match[3])
  ) {
    return null;
  }
  return date;
}

function monthCells(month: Date): Date[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const mondayIndex = (first.getDay() + 6) % 7;
  const start = new Date(first);
  start.setDate(1 - mondayIndex);
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function orderedRange(range: ActivityDateRange): ActivityDateRange {
  return range.from <= range.to ? range : { from: range.to, to: range.from };
}

function matchesTrackStatus(node: MindMapNode, statuses: TrackStatus[]): boolean {
  if (statuses.length === 0) return true;
  const state = readTrackState(node);
  if (!state) return false;
  return statuses.includes(shownTrackStatus(state));
}

/** Applied day, denial day, or the closed date shown on the row. */
function matchesTrackDate(node: MindMapNode, range: ActivityDateRange | null): boolean {
  if (!range) return true;
  const state = readTrackState(node);
  if (!state) return false;
  const { from, to } = orderedRange(range);
  return [state.appliedOn, state.deniedOn, trackClosedOn(state)].some(
    (iso) => Boolean(iso && iso >= from && iso <= to),
  );
}

function statusFilterLabel(statuses: TrackStatus[]): ReactNode {
  const selected = TRACK_STATUSES.filter((item) => statuses.includes(item.value));
  if (selected.length === 0) return "Status";
  if (selected.length === 1) {
    return (
      <>
        <span className={cn("size-1.5 rounded-full", selected[0].dot)} />
        {selected[0].label}
      </>
    );
  }
  return selected.map((item) => item.label).join(", ");
}

function StatusFilter({
  value,
  onChange,
}: {
  value: TrackStatus[];
  onChange: (value: TrackStatus[]) => void;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [box, setBox] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!open) return;
    function place() {
      const next = buttonRef.current?.getBoundingClientRect();
      if (next) setBox(next);
    }
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  const placeAbove = box != null && box.bottom + 220 > window.innerHeight && box.top > 220;
  const summary = statusFilterLabel(value);
  const summaryText =
    value.length === 0
      ? "Status"
      : TRACK_STATUSES.filter((item) => value.includes(item.value))
          .map((item) => item.label)
          .join(", ");

  function toggleStatus(status: TrackStatus) {
    onChange(
      value.includes(status)
        ? value.filter((item) => item !== status)
        : [...value, status],
    );
  }

  return (
    <>
      <FilterChip
        pressed={value.length > 0}
        open={open}
        label={summary}
        ariaLabel={value.length > 0 ? `Status filter, ${summaryText}` : "Filter by status"}
        title={value.length > 1 ? summaryText : undefined}
        buttonRef={buttonRef}
        clearLabel="Clear status filter"
        onClick={() => {
          setBox(buttonRef.current?.getBoundingClientRect() ?? null);
          setOpen((current) => !current);
        }}
        onClear={value.length > 0 ? () => {
          onChange([]);
          setOpen(false);
        } : undefined}
      />
      {open && box
        ? createPortal(
            <div
              ref={panelRef}
              role="dialog"
              aria-label="Filter by status"
              className="fixed z-50 w-40 rounded-md border bg-popover p-1 text-xs text-popover-foreground shadow-md"
              style={{
                left: Math.max(8, Math.min(box.left, window.innerWidth - 168)),
                top: placeAbove ? box.top - 4 : box.bottom + 4,
                transform: placeAbove ? "translateY(-100%)" : undefined,
              }}
            >
              {TRACK_STATUSES.map((item) => {
                const selected = value.includes(item.value);
                return (
                  <button
                    key={item.value}
                    type="button"
                    aria-pressed={selected}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left hover:bg-muted",
                      selected && "bg-muted",
                    )}
                    onClick={() => toggleStatus(item.value)}
                  >
                    <span className={cn("size-1.5 rounded-full", item.dot)} />
                    <span className="flex-1">{item.label}</span>
                    {selected ? <Check className="size-3 text-muted-foreground" /> : null}
                  </button>
                );
              })}
              {value.length > 0 ? (
                <button
                  type="button"
                  className="mt-1 w-full rounded-sm border-t px-2 py-1.5 text-left text-muted-foreground hover:bg-muted hover:text-foreground"
                  onClick={() => {
                    onChange([]);
                    setOpen(false);
                  }}
                >
                  Clear
                </button>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

function DateRangeFilter({
  value,
  onChange,
}: {
  value: ActivityDateRange | null;
  onChange: (value: ActivityDateRange | null) => void;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [box, setBox] = useState<DOMRect | null>(null);
  const [anchor, setAnchor] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [month, setMonth] = useState(() => {
    const initial = parseCalendarDate(value?.from) ?? new Date();
    return new Date(initial.getFullYear(), initial.getMonth(), 1);
  });

  useEffect(() => {
    if (!open) return;
    function place() {
      const next = buttonRef.current?.getBoundingClientRect();
      if (next) setBox(next);
    }
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
      setAnchor(null);
      setHover(null);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        setAnchor(null);
        setHover(null);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  const days = useMemo(() => monthCells(month), [month]);
  const today = new Date();
  const preview = anchor
    ? orderedRange({ from: anchor, to: hover ?? anchor })
    : value
      ? orderedRange(value)
      : null;
  const placeAbove = box != null && box.bottom + 248 > window.innerHeight && box.top > 248;
  const label = value ? formatTrackDateRange(value.from, value.to) : "Date";

  function toggle() {
    const initial = parseCalendarDate(value?.from) ?? new Date();
    setMonth(new Date(initial.getFullYear(), initial.getMonth(), 1));
    setAnchor(null);
    setHover(null);
    setBox(buttonRef.current?.getBoundingClientRect() ?? null);
    setOpen((current) => !current);
  }

  function choose(date: Date) {
    const iso = calendarDate(date);
    if (!anchor) {
      setAnchor(iso);
      onChange({ from: iso, to: iso });
      return;
    }
    onChange(orderedRange({ from: anchor, to: iso }));
    setAnchor(null);
    setHover(null);
    setOpen(false);
  }

  function clear() {
    onChange(null);
    setAnchor(null);
    setHover(null);
    setOpen(false);
  }

  const panelLeft =
    box == null ? 0 : Math.max(8, Math.min(box.left, window.innerWidth - 200));

  return (
    <>
      <FilterChip
        pressed={value != null}
        open={open}
        label={label}
        ariaLabel={value ? `Date filter, ${label}` : "Filter by date"}
        title={value ? label : undefined}
        buttonRef={buttonRef}
        clearLabel="Clear date filter"
        onClick={toggle}
        onClear={value ? clear : undefined}
      />
      {open && box
        ? createPortal(
            <div
              ref={panelRef}
              role="dialog"
              aria-label="Filter by date"
              className="fixed z-50 w-48 rounded-md border bg-popover p-1.5 text-xs text-popover-foreground shadow-md"
              style={{
                left: panelLeft,
                top: placeAbove ? box.top - 4 : box.bottom + 4,
                transform: placeAbove ? "translateY(-100%)" : undefined,
              }}
            >
              <div className="mb-2 flex items-center justify-between">
                <button
                  type="button"
                  className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label="Previous month"
                  onClick={() =>
                    setMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))
                  }
                >
                  <ChevronLeft className="size-3.5" />
                </button>
                <span className="text-xs font-medium">
                  {MONTH_NAMES[month.getMonth()]} {month.getFullYear()}
                </span>
                <button
                  type="button"
                  className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label="Next month"
                  onClick={() =>
                    setMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))
                  }
                >
                  <ChevronRight className="size-3.5" />
                </button>
              </div>
              <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] text-muted-foreground">
                {WEEKDAYS.map((day) => (
                  <span key={day} className="py-1">
                    {day}
                  </span>
                ))}
              </div>
              <div
                className="grid grid-cols-7 gap-0.5"
                onMouseLeave={() => setHover(null)}
              >
                {days.map((date) => {
                  const iso = calendarDate(date);
                  const inMonth = date.getMonth() === month.getMonth();
                  const inSpan = preview != null && iso >= preview.from && iso <= preview.to;
                  const isEnd = preview != null && (iso === preview.from || iso === preview.to);
                  const isToday = sameDay(date, today);
                  return (
                    <button
                      key={iso}
                      type="button"
                      className={cn(
                        "h-6 rounded-md text-[11px]",
                        !isEnd && (inMonth ? "text-foreground" : "text-muted-foreground/50"),
                        isEnd && "bg-foreground text-background",
                        inSpan && !isEnd && "bg-muted",
                        !inSpan && "hover:bg-muted",
                        isToday && !isEnd && "ring-1 ring-foreground/30",
                      )}
                      onMouseEnter={() => {
                        if (anchor) setHover(iso);
                      }}
                      onClick={() => choose(date)}
                    >
                      {date.getDate()}
                    </button>
                  );
                })}
              </div>
              <div className="mt-2 flex items-center justify-between border-t pt-2">
                <button
                  type="button"
                  className="rounded-md px-1.5 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                  onClick={() => {
                    const now = new Date();
                    setMonth(new Date(now.getFullYear(), now.getMonth(), 1));
                    onChange({ from: calendarDate(now), to: calendarDate(now) });
                    setAnchor(null);
                    setHover(null);
                    setOpen(false);
                  }}
                >
                  Today
                </button>
                <button
                  type="button"
                  className="rounded-md px-1.5 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                  onClick={clear}
                >
                  Clear
                </button>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

function TrackDateCell({
  value,
  label,
  name,
  onChange,
}: {
  value?: string;
  label: string;
  name: string;
  onChange: (value: string) => void;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [box, setBox] = useState<DOMRect | null>(null);
  const selected = parseCalendarDate(value);
  const [month, setMonth] = useState(() => {
    const initial = selected ?? new Date();
    return new Date(initial.getFullYear(), initial.getMonth(), 1);
  });

  useEffect(() => {
    if (!open) return;
    function place() {
      const next = buttonRef.current?.getBoundingClientRect();
      if (next) setBox(next);
    }
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  const days = useMemo(() => monthCells(month), [month]);
  const today = new Date();
  const placeAbove = box != null && box.bottom + 248 > window.innerHeight && box.top > 248;

  function toggle() {
    const initial = selected ?? new Date();
    setMonth(new Date(initial.getFullYear(), initial.getMonth(), 1));
    setBox(buttonRef.current?.getBoundingClientRect() ?? null);
    setOpen((current) => !current);
  }

  function choose(date: Date) {
    onChange(calendarDate(date));
    setOpen(false);
  }

  return (
    <td className="px-2 py-1">
      <button
        ref={buttonRef}
        type="button"
        aria-label={`${label} for ${name}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={cn(
          "flex h-6 w-full cursor-pointer items-center text-left text-xs",
          value ? "text-foreground" : "text-muted-foreground",
        )}
        onClick={toggle}
      >
        {value ? formatTrackDate(value) : "—"}
      </button>
      {open && box
        ? createPortal(
            <div
              ref={panelRef}
              role="dialog"
              aria-label={`${label} for ${name}`}
              className="fixed z-50 w-48 rounded-md border bg-popover p-1.5 text-xs text-popover-foreground shadow-md"
              style={{
                left: box.left,
                top: placeAbove ? box.top - 4 : box.bottom + 4,
                transform: placeAbove ? "translateY(-100%)" : undefined,
              }}
            >
              <div className="mb-2 flex items-center justify-between">
                <button
                  type="button"
                  className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label="Previous month"
                  onClick={() =>
                    setMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))
                  }
                >
                  <ChevronLeft className="size-3.5" />
                </button>
                <span className="text-xs font-medium">
                  {MONTH_NAMES[month.getMonth()]} {month.getFullYear()}
                </span>
                <button
                  type="button"
                  className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label="Next month"
                  onClick={() =>
                    setMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))
                  }
                >
                  <ChevronRight className="size-3.5" />
                </button>
              </div>
              <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] text-muted-foreground">
                {WEEKDAYS.map((day) => (
                  <span key={day} className="py-1">
                    {day}
                  </span>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-0.5">
                {days.map((date) => {
                  const inMonth = date.getMonth() === month.getMonth();
                  const isSelected = selected != null && sameDay(date, selected);
                  const isToday = sameDay(date, today);
                  return (
                    <button
                      key={calendarDate(date)}
                      type="button"
                      className={cn(
                        "h-6 rounded-md text-[11px]",
                        inMonth ? "text-foreground" : "text-muted-foreground/50",
                        isSelected && "bg-foreground text-background",
                        !isSelected && "hover:bg-muted",
                        isToday && !isSelected && "ring-1 ring-foreground/30",
                      )}
                      onClick={() => choose(date)}
                    >
                      {date.getDate()}
                    </button>
                  );
                })}
              </div>
              <div className="mt-2 flex items-center justify-between border-t pt-2">
                <button
                  type="button"
                  className="rounded-md px-1.5 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                  onClick={() => choose(new Date())}
                >
                  Today
                </button>
                <button
                  type="button"
                  className="rounded-md px-1.5 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                  onClick={() => {
                    onChange("");
                    setOpen(false);
                  }}
                >
                  Clear
                </button>
              </div>
            </div>,
            document.body,
          )
        : null}
    </td>
  );
}

function isTrackStatus(value: string): value is TrackStatus {
  return TRACK_STATUSES.some((item) => item.value === value);
}
