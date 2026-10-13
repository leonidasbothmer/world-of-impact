"use client";

import { useEffect, useState } from "react";

const memory = new Map<string, string | null>();
const inflight = new Map<string, Promise<string | null>>();
let active = 0;
const waiters: Array<() => void> = [];

function runLimited(job: () => Promise<string | null>): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const start = () => {
      active += 1;
      job().then(resolve, reject).finally(() => {
        active -= 1;
        waiters.shift()?.();
      });
    };
    if (active < 4) start();
    else waiters.push(start);
  });
}

async function fetchTitle(href: string): Promise<string | null> {
  try {
    const response = await fetch(`/api/link-meta?url=${encodeURIComponent(href)}`);
    if (!response.ok) return null;
    const body = (await response.json()) as { title?: unknown };
    return typeof body.title === "string" && body.title.trim() ? body.title.trim() : null;
  } catch {
    return null;
  }
}

function cachedTitle(href: string | null): string | null {
  if (!href) return null;
  return memory.get(href) ?? null;
}

/** Resolved page title for a URL, or null while loading or when unavailable. */
export function useLinkTitle(href: string | null): string | null {
  const [state, setState] = useState(() => ({
    href,
    title: cachedTitle(href),
  }));

  if (state.href !== href) {
    setState({ href, title: cachedTitle(href) });
  }

  useEffect(() => {
    if (!href || memory.has(href)) return;
    let cancel = false;
    let pending = inflight.get(href);
    if (!pending) {
      pending = runLimited(() => fetchTitle(href));
      inflight.set(href, pending);
    }
    pending.then((value) => {
      memory.set(href, value);
      inflight.delete(href);
      if (!cancel) setState({ href, title: value });
    });
    return () => {
      cancel = true;
    };
  }, [href]);

  return state.href === href ? state.title : cachedTitle(href);
}
