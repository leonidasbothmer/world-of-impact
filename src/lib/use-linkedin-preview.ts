"use client";

import { useCallback, useRef, useState } from "react";
import type { LinkedInPreview } from "@/lib/linkedin-preview";

export function useLinkedInPreview() {
  const [linkedIn, setLinkedIn] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const generation = useRef(0);

  const reset = useCallback(() => {
    generation.current += 1;
    pendingRef.current = false;
    setLinkedIn("");
    setError(null);
    setPending(false);
  }, []);

  const onChange = useCallback((value: string) => {
    setLinkedIn(value);
    setError(null);
  }, []);

  const resolve = useCallback(async (): Promise<
    { ok: true; preview: LinkedInPreview | null } | { ok: false }
  > => {
    const trimmed = linkedIn.trim();
    if (!trimmed) return { ok: true, preview: null };
    if (pendingRef.current) return { ok: false };
    const token = generation.current;
    pendingRef.current = true;
    setPending(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/linkedin-preview?url=${encodeURIComponent(trimmed)}`,
      );
      const body = (await response.json().catch(() => null)) as
        | (Partial<LinkedInPreview> & { error?: string })
        | null;
      if (generation.current !== token) return { ok: false };
      if (response.status === 400) {
        setError(body?.error ?? "Use a LinkedIn profile or company link.");
        return { ok: false };
      }
      if (!response.ok || !body?.linkedIn) {
        setError("Could not read that LinkedIn page. Try again.");
        return { ok: false };
      }
      return {
        ok: true,
        preview: {
          linkedIn: body.linkedIn,
          ...(body.notes ? { notes: body.notes } : {}),
          ...(body.imageUrl ? { imageUrl: body.imageUrl } : {}),
        },
      };
    } catch {
      if (generation.current === token) {
        setError("Could not read that LinkedIn page. Try again.");
      }
      return { ok: false };
    } finally {
      if (generation.current === token) {
        pendingRef.current = false;
        setPending(false);
      }
    }
  }, [linkedIn]);

  return { linkedIn, onChange, error, pending, reset, resolve };
}
