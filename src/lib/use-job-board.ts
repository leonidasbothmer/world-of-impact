"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  jobMatchesFilters,
  loadJobFilters,
  normalizeJobTag,
  saveJobFilters,
} from "@/lib/job-filters";
import type { MindMapNode } from "@/types/mindmap";

export type ListedJob = {
  id: string;
  title: string;
  location: string | null;
  department: string | null;
  url: string;
  postedOn: string | null;
};

export type CareerResult = {
  organizationId: string;
  organizationName: string;
  careerPage: string;
  status: "ok" | "empty" | "unread";
  jobs: ListedJob[];
};

export type JobRow = ListedJob & {
  organizationId: string;
  organizationName: string;
  imageUrl?: string;
};

const SEEN_KEY = "impact-jobs-seen";
const BATCH_SIZE = 6;
const REFRESH_AFTER_MS = 6 * 60 * 60 * 1000;

type CareerPage = {
  id: string;
  name: string;
  careerPage: string;
};

function loadSeen(): Set<string> | null {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    return new Set(parsed.filter((item) => typeof item === "string"));
  } catch {
    return null;
  }
}

function saveSeen(ids: Iterable<string>) {
  localStorage.setItem(SEEN_KEY, JSON.stringify([...ids]));
}

function compareJobs(a: JobRow, b: JobRow): number {
  if (a.postedOn && b.postedOn && a.postedOn !== b.postedOn) {
    return a.postedOn < b.postedOn ? 1 : -1;
  }
  if (a.postedOn && !b.postedOn) return -1;
  if (!a.postedOn && b.postedOn) return 1;
  const org = a.organizationName.localeCompare(b.organizationName);
  if (org !== 0) return org;
  return a.title.localeCompare(b.title);
}

export function useJobBoard(nodes: MindMapNode[], enabled: boolean) {
  const [filters, setFilters] = useState<string[]>([]);
  const [results, setResults] = useState<CareerResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [seen, setSeen] = useState<Set<string> | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const pagesRef = useRef<CareerPage[]>([]);
  const loadedAt = useRef(0);
  const hasLoaded = useRef(false);

  useEffect(() => {
    setFilters(loadJobFilters());
  }, []);

  const pages = useMemo(
    () =>
      nodes
        .filter((node) => node.type === "organization" && node.careerPage?.trim())
        .map((node) => ({
          id: node.id,
          name: node.name,
          careerPage: node.careerPage!.trim(),
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [nodes],
  );
  pagesRef.current = pages;
  const pagesKey = pages
    .map((page) => `${page.id}\u0000${page.careerPage}`)
    .join("\u0001");

  const orgs = useMemo(
    () => new Map(nodes.map((node) => [node.id, node])),
    [nodes],
  );

  useEffect(() => {
    if (!enabled) return;
    const current = pagesRef.current;
    if (current.length === 0) {
      setResults([]);
      setLoading(false);
      setReady(true);
      setError(null);
      hasLoaded.current = true;
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    if (!hasLoaded.current) {
      setResults([]);
      setReady(false);
    }

    async function load() {
      const collected: CareerResult[] = [];
      let failed = false;
      for (let index = 0; index < current.length; index += BATCH_SIZE) {
        if (controller.signal.aborted) return;
        const batch = current.slice(index, index + BATCH_SIZE);
        try {
          const response = await fetch("/api/jobs", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ pages: batch }),
            signal: controller.signal,
          });
          if (!response.ok) throw new Error(String(response.status));
          const body = (await response.json()) as { results?: CareerResult[] };
          collected.push(...(body.results ?? []));
          if (!controller.signal.aborted) setResults([...collected]);
        } catch (fetchError) {
          if (controller.signal.aborted) return;
          if (fetchError instanceof DOMException && fetchError.name === "AbortError") {
            return;
          }
          failed = true;
        }
      }
      if (controller.signal.aborted) return;
      loadedAt.current = Date.now();
      hasLoaded.current = true;
      setLoading(false);
      setReady(true);
      setError(failed ? "Some career pages could not be checked." : null);
    }

    void load();
    return () => controller.abort();
  }, [enabled, pagesKey, reloadKey]);

  useEffect(() => {
    if (!enabled) return;
    function onVisible() {
      if (document.visibilityState !== "visible") return;
      if (!loadedAt.current) return;
      if (Date.now() - loadedAt.current < REFRESH_AFTER_MS) return;
      setReloadKey((current) => current + 1);
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [enabled]);

  const jobIdsKey = results
    .flatMap((result) => result.jobs.map((job) => job.id))
    .join("\u0000");

  useEffect(() => {
    if (!ready) return;
    const ids = jobIdsKey ? jobIdsKey.split("\u0000") : [];
    const stored = loadSeen();
    if (!stored) {
      saveSeen(ids);
      setSeen(new Set(ids));
      return;
    }
    setSeen(stored);
  }, [ready, jobIdsKey]);

  const rows = useMemo(() => {
    const list: JobRow[] = [];
    for (const result of results) {
      const org = orgs.get(result.organizationId);
      for (const job of result.jobs) {
        list.push({
          ...job,
          organizationId: result.organizationId,
          organizationName: org?.name ?? result.organizationName,
          imageUrl: org?.imageUrl,
        });
      }
    }
    list.sort(compareJobs);
    return list;
  }, [orgs, results]);

  const visible = useMemo(
    () =>
      rows.filter((row) =>
        jobMatchesFilters(row.title, row.department, filters),
      ),
    [filters, rows],
  );

  const isNew = (row: JobRow) => seen != null && !seen.has(row.id);
  const newRows = visible.filter(isNew);
  const seenRows = visible.filter((row) => !isNew(row));
  const unread = results.filter((result) => result.status === "unread");

  function addFilter(value: string) {
    const tag = normalizeJobTag(value);
    if (!tag) return;
    setFilters((current) => {
      if (current.some((item) => item.toLowerCase() === tag.toLowerCase())) {
        return current;
      }
      const next = [...current, tag];
      saveJobFilters(next);
      return next;
    });
  }

  function removeFilter(tag: string) {
    setFilters((current) => {
      const next = current.filter((item) => item !== tag);
      saveJobFilters(next);
      return next;
    });
  }

  function markSeen() {
    setSeen((current) => {
      const next = new Set(current ?? []);
      for (const row of newRows) next.add(row.id);
      saveSeen(next);
      return next;
    });
  }

  return {
    filters,
    addFilter,
    removeFilter,
    rows,
    visible,
    newRows,
    seenRows,
    newCount: ready ? newRows.length : 0,
    unread,
    loading,
    error,
    ready,
    pageCount: pages.length,
    markSeen,
  };
}
