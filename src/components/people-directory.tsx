"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { describeLink } from "@/lib/link-display";
import { cn } from "@/lib/utils";
import type { MindMapEdge, MindMapNode } from "@/types/mindmap";

type PeopleDirectoryProps = {
  nodes: MindMapNode[];
  edges: MindMapEdge[];
  selectedNodeId: string | null;
  onOpenOnGraph: (id: string) => void;
};

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function organizationsByPerson(
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
      source.type === "person" ? source : target.type === "person" ? target : null;
    if (!organization || !person) continue;
    const list = grouped.get(person.id) ?? [];
    if (!list.some((item) => item.id === organization.id)) list.push(organization);
    grouped.set(person.id, list);
  }
  for (const list of grouped.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name));
  }
  return grouped;
}

export function PeopleDirectory({
  nodes,
  edges,
  selectedNodeId,
  onOpenOnGraph,
}: PeopleDirectoryProps) {
  const [query, setQuery] = useState("");
  const organizations = useMemo(
    () => organizationsByPerson(nodes, edges),
    [nodes, edges],
  );
  const people = useMemo(
    () =>
      nodes
        .filter((node) => node.type === "person")
        .sort((a, b) => a.name.localeCompare(b.name)),
    [nodes],
  );
  const needle = query.trim().toLowerCase();
  const rows = needle
    ? people.filter((person) => {
        const orgs = organizations.get(person.id) ?? [];
        return (
          person.name.toLowerCase().includes(needle) ||
          (person.email ?? "").toLowerCase().includes(needle) ||
          (person.linkedIn ?? "").toLowerCase().includes(needle) ||
          orgs.some((org) => org.name.toLowerCase().includes(needle))
        );
      })
    : people;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-3 py-1.5">
        <h2 className="text-xs font-medium">People</h2>
        <span className="text-xs text-muted-foreground">
          {rows.length === people.length
            ? people.length
            : `${rows.length} of ${people.length}`}
        </span>
        <div className="ml-auto w-48">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter by name"
            aria-label="Filter people by name"
            className="h-6 text-xs"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-[640px] table-fixed border-collapse text-xs">
          <colgroup>
            <col style={{ width: "28%" }} />
            <col />
            <col style={{ width: "24%" }} />
            <col style={{ width: "22%" }} />
          </colgroup>
          <thead className="sticky top-0 z-10 bg-background">
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="px-3 py-1.5 font-medium">Name</th>
              <th className="px-2 py-1.5 font-medium">Organizations</th>
              <th className="px-2 py-1.5 font-medium">Email</th>
              <th className="px-2 py-1.5 font-medium">LinkedIn</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-3 py-8 text-center text-xs text-muted-foreground"
                >
                  {people.length === 0
                    ? "No people yet."
                    : "No people match this filter."}
                </td>
              </tr>
            ) : (
              rows.map((person) => {
                const link = person.linkedIn
                  ? describeLink(person.linkedIn)
                  : null;
                const orgs = organizations.get(person.id) ?? [];
                return (
                  <tr
                    key={person.id}
                    className={cn(
                      "border-b",
                      person.id === selectedNodeId && "bg-muted/50",
                    )}
                  >
                    <td className="px-3 py-1.5">
                      <button
                        type="button"
                        className="inline-flex max-w-full items-center gap-2 text-left font-medium hover:underline"
                        onClick={() => onOpenOnGraph(person.id)}
                      >
                        <span className="inline-flex size-5 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-muted">
                          {person.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element -- remote LinkedIn/OG hotlinks by design
                            <img
                              src={person.imageUrl}
                              alt=""
                              className="size-full object-cover"
                              draggable={false}
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <span className="text-[8px] font-semibold leading-none text-muted-foreground">
                              {initials(person.name) || "?"}
                            </span>
                          )}
                        </span>
                        <span className="truncate">{person.name}</span>
                      </button>
                    </td>
                    <td className="truncate px-2 py-1.5 text-muted-foreground">
                      {orgs.map((org) => org.name).join(", ")}
                    </td>
                    <td className="truncate px-2 py-1.5">
                      {person.email ? (
                        <a
                          href={`mailto:${person.email}`}
                          className="hover:underline"
                        >
                          {person.email}
                        </a>
                      ) : null}
                    </td>
                    <td className="truncate px-2 py-1.5">
                      {link ? (
                        <a
                          href={link.href}
                          target="_blank"
                          rel="noreferrer"
                          className="hover:underline"
                        >
                          {link.label}
                        </a>
                      ) : (
                        person.linkedIn
                      )}
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
