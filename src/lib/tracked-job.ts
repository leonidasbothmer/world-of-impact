import { httpUrl } from "@/lib/link-display";
import {
  TRACK_STATUSES,
  isTracked,
  readTrackState,
  shownTrackStatus,
} from "@/lib/tracking";
import type { MindMapNode } from "@/types/mindmap";

export type TrackedJobMark = {
  dot: string;
  label: string;
};

/** Stable comparison key for a job link, ignoring host case, www, and a trailing slash. */
export function canonicalJobUrl(value: string): string | null {
  const url = httpUrl(value);
  if (!url) return null;
  url.hostname = url.hostname.replace(/^www\./i, "").toLowerCase();
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "");
  for (const key of [...url.searchParams.keys()]) {
    if (key.toLowerCase().startsWith("utm_")) url.searchParams.delete(key);
  }
  url.searchParams.sort();
  return url.href;
}

function titleKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function markKey(organizationId: string, kind: "url" | "title", value: string): string {
  return `${organizationId}\0${kind}:${value}`;
}

/**
 * Positions saved on tracked organizations, keyed so a freshly scraped listing
 * can be matched by its link or, when the position was typed, by its title.
 */
export function trackedJobMarks(nodes: MindMapNode[]): Map<string, TrackedJobMark> {
  const marks = new Map<string, TrackedJobMark>();
  for (const node of nodes) {
    if (node.type !== "organization" || !isTracked(node)) continue;
    const state = readTrackState(node);
    const role = state?.role?.trim();
    if (!state || !role) continue;
    const shown = shownTrackStatus(state);
    const status = TRACK_STATUSES.find((item) => item.value === shown);
    if (!status) continue;
    const mark = { dot: status.dot, label: status.label };
    const url = canonicalJobUrl(role);
    if (url) marks.set(markKey(node.id, "url", url), mark);
    else marks.set(markKey(node.id, "title", titleKey(role)), mark);
  }
  return marks;
}

export function markForJob(
  marks: Map<string, TrackedJobMark>,
  job: { organizationId: string; url: string; title: string },
): TrackedJobMark | undefined {
  const url = canonicalJobUrl(job.url);
  if (url) {
    const byUrl = marks.get(markKey(job.organizationId, "url", url));
    if (byUrl) return byUrl;
  }
  return marks.get(markKey(job.organizationId, "title", titleKey(job.title)));
}
