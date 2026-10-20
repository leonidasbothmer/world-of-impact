"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { FilterChip } from "@/components/filter-chip";
import { Input } from "@/components/ui/input";
import { formatTrackDate } from "@/lib/tracking";
import { markForJob, type TrackedJobMark } from "@/lib/tracked-job";
import type { JobRow, useJobBoard } from "@/lib/use-job-board";
import { cn } from "@/lib/utils";

type JobBoard = ReturnType<typeof useJobBoard>;

type JobsListProps = {
  board: JobBoard;
  selectedNodeId: string | null;
  /** Status of a tracked position, keyed for the current scraped listings. */
  jobMarks: Map<string, TrackedJobMark>;
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

export function JobsList({
  board,
  selectedNodeId,
  jobMarks,
  onOpenOnGraph,
}: JobsListProps) {
  const [draft, setDraft] = useState("");
  const {
    filters,
    addFilter,
    removeFilter,
    rows,
    visible,
    newRows,
    seenRows,
    newCount,
    unread,
    loading,
    error,
    pageCount,
    markSeen,
  } = board;
  const showSplit = newRows.length > 0 && seenRows.length > 0;

  function commitDraft() {
    const value = draft.trim();
    if (!value) return;
    addFilter(value);
    setDraft("");
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-3 py-1.5">
        <h2 className="text-xs font-medium">Jobs</h2>
        <span className="text-xs text-muted-foreground">
          {visible.length === rows.length
            ? rows.length
            : `${visible.length} of ${rows.length}`}
        </span>
        {loading ? (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Loader2 className="size-3 animate-spin" />
            Checking career pages
          </span>
        ) : null}
        {newCount > 0 ? (
          <button
            type="button"
            className="rounded-md px-1.5 py-0.5 text-xs font-medium text-blue-800 hover:bg-blue-50 dark:text-blue-200 dark:hover:bg-blue-950"
            onClick={markSeen}
          >
            Mark {newCount} seen
          </button>
        ) : null}
        {error ? (
          <span className="text-xs text-destructive">{error}</span>
        ) : null}
        <div className="ml-auto flex items-center gap-1">
          {filters.map((tag) => (
            <FilterChip
              key={tag}
              pressed
              open={false}
              menu={false}
              label={tag}
              ariaLabel={`Role filter, ${tag}`}
              clearLabel={`Remove ${tag} filter`}
              onClick={() => removeFilter(tag)}
              onClear={() => removeFilter(tag)}
            />
          ))}
          <div className="ml-1 w-48">
            <Input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commitDraft();
                } else if (event.key === "Backspace" && draft === "" && filters.length > 0) {
                  removeFilter(filters[filters.length - 1]);
                }
              }}
              onBlur={commitDraft}
              placeholder="Filter by role"
              aria-label="Filter jobs by role"
              className="h-6 text-xs"
            />
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-[760px] table-fixed border-collapse text-xs">
          <colgroup>
            <col />
            <col style={{ width: "20%" }} />
            <col style={{ width: "16%" }} />
            <col style={{ width: "16%" }} />
            <col style={{ width: "8.5rem" }} />
          </colgroup>
          <thead className="sticky top-0 z-10 bg-background">
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="px-3 py-1.5 font-medium">Role</th>
              <th className="px-2 py-1.5 font-medium">Organization</th>
              <th className="px-2 py-1.5 font-medium">Location</th>
              <th className="px-2 py-1.5 font-medium">Department</th>
              <th className="px-2 py-1.5 font-medium">Posted</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-3 py-8 text-center text-xs text-muted-foreground"
                >
                  {loading
                    ? "Reading career pages…"
                    : pageCount === 0
                      ? "No career pages yet. Add one on an organization."
                      : filters.length > 0
                        ? "No roles match these tags."
                        : "No open roles on the career pages that could be read."}
                </td>
              </tr>
            ) : (
              <>
                {newRows.map((row) => (
                  <JobTableRow
                    key={`${row.organizationId}:${row.id}`}
                    row={row}
                    isNew
                    mark={markForJob(jobMarks, row)}
                    selected={row.organizationId === selectedNodeId}
                    onOpenOnGraph={onOpenOnGraph}
                  />
                ))}
                {showSplit ? (
                  <tr className="border-b bg-muted/40">
                    <td
                      colSpan={5}
                      className="px-3 py-1 text-[10px] font-medium tracking-wide text-muted-foreground uppercase"
                    >
                      Seen
                    </td>
                  </tr>
                ) : null}
                {seenRows.map((row) => (
                  <JobTableRow
                    key={`${row.organizationId}:${row.id}`}
                    row={row}
                    isNew={false}
                    mark={markForJob(jobMarks, row)}
                    selected={row.organizationId === selectedNodeId}
                    onOpenOnGraph={onOpenOnGraph}
                  />
                ))}
              </>
            )}
          </tbody>
        </table>
      </div>

      {unread.length > 0 ? (
        <details className="shrink-0 border-t px-3 py-1.5 text-xs text-muted-foreground">
          <summary className="cursor-pointer">
            {unread.length} career {unread.length === 1 ? "page" : "pages"} could
            not be read
          </summary>
          <ul className="mt-1.5 space-y-1 pb-1">
            {unread.map((result) => (
              <li key={result.organizationId} className="flex items-center gap-2">
                <button
                  type="button"
                  className="hover:underline"
                  onClick={() => onOpenOnGraph(result.organizationId)}
                >
                  {result.organizationName}
                </button>
                <a
                  href={result.careerPage}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:underline"
                >
                  Careers
                </a>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

function JobTableRow({
  row,
  isNew,
  mark,
  selected,
  onOpenOnGraph,
}: {
  row: JobRow;
  isNew: boolean;
  mark?: TrackedJobMark;
  selected: boolean;
  onOpenOnGraph: (id: string) => void;
}) {
  return (
    <tr className={cn("border-b", selected && "bg-muted/50")}>
      <td className="px-3 py-1.5">
        <a
          href={row.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex max-w-full items-center gap-1.5 font-medium hover:underline"
        >
          {mark ? (
            <span
              className={cn("size-1.5 shrink-0 rounded-full", mark.dot)}
              title={mark.label}
              aria-label={mark.label}
            />
          ) : null}
          {isNew ? (
            <span className="shrink-0 rounded border border-blue-200 bg-blue-50 px-1 py-px text-[10px] font-medium text-blue-800 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200">
              New
            </span>
          ) : null}
          <span className="truncate">{row.title}</span>
        </a>
      </td>
      <td className="px-2 py-1.5">
        <button
          type="button"
          className="inline-flex max-w-full items-center gap-1.5 text-left hover:underline"
          onClick={() => onOpenOnGraph(row.organizationId)}
        >
          <span className="inline-flex size-5 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted">
            {row.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- remote logos by design
              <img
                src={row.imageUrl}
                alt=""
                className="size-full object-cover"
                draggable={false}
                referrerPolicy="no-referrer"
              />
            ) : (
              <span className="text-[8px] font-semibold leading-none text-muted-foreground">
                {initials(row.organizationName) || "?"}
              </span>
            )}
          </span>
          <span className="truncate">{row.organizationName}</span>
        </button>
      </td>
      <td
        className="truncate px-2 py-1.5 text-muted-foreground"
        title={row.location ?? undefined}
      >
        {row.location ?? "—"}
      </td>
      <td
        className="truncate px-2 py-1.5 text-muted-foreground"
        title={row.department ?? undefined}
      >
        {row.department ?? "—"}
      </td>
      <td className="px-2 py-1.5 text-muted-foreground">
        {row.postedOn ? formatTrackDate(row.postedOn) : "—"}
      </td>
    </tr>
  );
}
