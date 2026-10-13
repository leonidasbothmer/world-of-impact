"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { TextCell } from "@/components/org-table";
import { Input } from "@/components/ui/input";
import { isTracked } from "@/lib/tracking";
import { cn } from "@/lib/utils";
import type { MindMapNode } from "@/types/mindmap";

export type TrackerLinkPatch = {
  linkedIn?: string;
  imageUrl?: string;
  /** Ignore a late photo fetch if the LinkedIn field has since changed. */
  onlyIfLinkedIn?: string;
};

type JobTrackerProps = {
  nodes: MindMapNode[];
  selectedNodeId: string | null;
  onOpenOnGraph: (id: string) => void;
  onSetTracked: (id: string, tracked: boolean) => void;
  onPatchLink: (id: string, patch: TrackerLinkPatch) => void;
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
}: {
  name: string;
  imageUrl?: string;
  rounded: "full" | "md";
}) {
  return (
    <span
      className={cn(
        "inline-flex size-7 shrink-0 items-center justify-center overflow-hidden border bg-muted",
        rounded === "full" ? "rounded-full" : "rounded-md",
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
        <span className="text-[10px] font-semibold text-muted-foreground">
          {initials(name) || "?"}
        </span>
      )}
    </span>
  );
}

export function JobTracker({
  nodes,
  selectedNodeId,
  onOpenOnGraph,
  onSetTracked,
  onPatchLink,
}: JobTrackerProps) {
  const [section, setSection] = useState<"organizations" | "people">(
    "organizations",
  );
  const [query, setQuery] = useState("");
  const [addQuery, setAddQuery] = useState("");
  const [addOpen, setAddOpen] = useState(false);

  const organizations = useMemo(
    () =>
      nodes
        .filter((node) => node.type === "organization" && isTracked(node))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [nodes],
  );
  const people = useMemo(
    () =>
      nodes
        .filter((node) => node.type === "person")
        .sort((a, b) => a.name.localeCompare(b.name)),
    [nodes],
  );

  const needle = query.trim().toLowerCase();
  const orgRows = organizations.filter((node) => {
    if (!needle) return true;
    return (
      node.name.toLowerCase().includes(needle) ||
      (node.linkedIn ?? "").toLowerCase().includes(needle)
    );
  });
  const peopleRows = people.filter((node) => {
    if (!needle) return true;
    return (
      node.name.toLowerCase().includes(needle) ||
      (node.linkedIn ?? "").toLowerCase().includes(needle)
    );
  });

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

  const rows = section === "people" ? peopleRows : orgRows;
  const total = section === "people" ? people.length : organizations.length;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-3 py-2">
        <h2 className="text-sm font-medium">Job tracker</h2>
        <div
          className="inline-flex rounded-lg border bg-muted/40 p-0.5"
          role="tablist"
          aria-label="Job tracker"
        >
          <button
            type="button"
            role="tab"
            aria-selected={section === "organizations"}
            className={cn(
              "rounded-md px-2 py-0.5 text-xs font-medium",
              section === "organizations"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground",
            )}
            onClick={() => setSection("organizations")}
          >
            Organizations
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={section === "people"}
            className={cn(
              "rounded-md px-2 py-0.5 text-xs font-medium",
              section === "people"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground",
            )}
            onClick={() => setSection("people")}
          >
            People
          </button>
        </div>
        <span className="text-xs text-muted-foreground">
          {rows.length === total ? total : `${rows.length} of ${total}`}
        </span>
        {section === "organizations" ? (
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
              className="h-7 text-xs"
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
        ) : null}
        <div className="ml-auto w-48">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter by name"
            aria-label={
              section === "people"
                ? "Filter people by name"
                : "Filter tracked organizations by name"
            }
            className="h-7 text-xs"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-background">
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="w-[40%] px-3 py-2 font-medium">Name</th>
              <th className="px-2 py-2 font-medium">LinkedIn</th>
              {section === "organizations" ? (
                <th className="w-10 px-2 py-2 font-medium">
                  <span className="sr-only">Remove</span>
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={section === "organizations" ? 3 : 2}
                  className="px-3 py-10 text-center text-sm text-muted-foreground"
                >
                  {section === "people"
                    ? people.length === 0
                      ? "No people yet."
                      : "No people match this filter."
                    : organizations.length === 0
                      ? "Nothing tracked yet. Add an organization above."
                      : "No organizations match this filter."}
                </td>
              </tr>
            ) : (
              rows.map((node) => (
                <tr
                  key={node.id}
                  className={cn(
                    "border-b align-middle",
                    node.id === selectedNodeId && "bg-muted/50",
                  )}
                >
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      className="flex items-center gap-2 text-left font-medium hover:underline"
                      onClick={() => onOpenOnGraph(node.id)}
                    >
                      <TrackerAvatar
                        name={node.name}
                        imageUrl={node.imageUrl}
                        rounded={node.type === "person" ? "full" : "md"}
                      />
                      {node.name}
                    </button>
                  </td>
                  <TextCell
                    field="linkedIn"
                    label="LinkedIn"
                    name={node.name}
                    placeholder={
                      node.type === "person"
                        ? "LinkedIn profile"
                        : "LinkedIn"
                    }
                    link
                    value={node.linkedIn ?? ""}
                    onCommit={(value) => {
                      void commitLinkedIn(node.id, value);
                    }}
                  />
                  {section === "organizations" ? (
                    <td className="px-2 py-1">
                      <button
                        type="button"
                        className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                        aria-label={`Remove ${node.name} from the job tracker`}
                        onClick={() => onSetTracked(node.id, false)}
                      >
                        <X className="size-3.5" />
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
