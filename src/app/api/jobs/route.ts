import { NextResponse } from "next/server";
import { httpUrl } from "@/lib/link-display";
import { readCareerPage, type ListedJob } from "@/lib/job-boards";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

type JobsPage = {
  id: string;
  name: string;
  careerPage: string;
};

const BATCH_LIMIT = 8;

function parsePages(body: unknown): JobsPage[] | null {
  if (!body || typeof body !== "object") return null;
  const pages = (body as { pages?: unknown }).pages;
  if (!Array.isArray(pages) || pages.length === 0 || pages.length > BATCH_LIMIT) {
    return null;
  }
  const parsed: JobsPage[] = [];
  for (const page of pages) {
    if (!page || typeof page !== "object") return null;
    const { id, name, careerPage } = page as Record<string, unknown>;
    if (typeof id !== "string" || typeof name !== "string" || typeof careerPage !== "string") {
      return null;
    }
    const trimmedId = id.trim();
    const trimmedName = name.trim();
    const trimmedPage = careerPage.trim();
    if (
      !trimmedId ||
      trimmedId.length > 200 ||
      trimmedName.length > 300 ||
      trimmedPage.length > 2000 ||
      !httpUrl(trimmedPage)
    ) {
      return null;
    }
    parsed.push({
      id: trimmedId,
      name: trimmedName || "Organization",
      careerPage: trimmedPage,
    });
  }
  return parsed;
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await fn(items[index]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );
  return results;
}

export async function POST(request: Request) {
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let pages: JobsPage[] | null;
  try {
    pages = parsePages(await request.json());
  } catch {
    pages = null;
  }
  if (!pages) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  try {
    const results = await mapLimit(pages, 4, async (page) => {
      const read = await readCareerPage(page.careerPage);
      const jobs: ListedJob[] = read.jobs;
      return {
        organizationId: page.id,
        organizationName: page.name,
        careerPage: page.careerPage,
        status: read.status,
        jobs,
      };
    });
    return NextResponse.json(
      { results },
      { headers: { "Cache-Control": "private, max-age=300" } },
    );
  } catch (error) {
    console.error("POST /api/jobs failed:", error);
    return NextResponse.json(
      { error: "Failed to read career pages" },
      { status: 500 },
    );
  }
}
