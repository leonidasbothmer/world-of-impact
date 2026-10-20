import { NextResponse, type NextRequest } from "next/server";
import { lookupCompany } from "@/lib/company-lookup";
import { httpUrl } from "@/lib/link-display";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 30;

const recent: number[] = [];

function rateLimited(): boolean {
  const now = Date.now();
  while (recent.length > 0 && recent[0]! < now - 60_000) recent.shift();
  if (recent.length >= 20) return true;
  recent.push(now);
  return false;
}

export async function GET(request: NextRequest) {
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const name = (request.nextUrl.searchParams.get("name") ?? "").trim().replace(/\s+/g, " ");
  const websiteRaw = (request.nextUrl.searchParams.get("website") ?? "").trim();
  if (name.length < 2 || name.length > 120) {
    return NextResponse.json(
      { error: "Enter a company name to look up." },
      { status: 400 },
    );
  }
  if (websiteRaw && (websiteRaw.length > 300 || !httpUrl(websiteRaw))) {
    return NextResponse.json(
      { error: "That website is not a public link." },
      { status: 400 },
    );
  }
  if (rateLimited()) {
    return NextResponse.json(
      { error: "Too many lookups. Wait a minute and try again." },
      { status: 429 },
    );
  }

  try {
    const profile = await lookupCompany(name, websiteRaw || undefined);
    if (!profile) {
      return NextResponse.json(
        { error: `No company matched ${name}.` },
        { status: 404 },
      );
    }
    return NextResponse.json(
      { profile },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const status =
      error &&
      typeof error === "object" &&
      "status" in error &&
      typeof (error as { status: unknown }).status === "number"
        ? (error as { status: number }).status
        : 502;
    console.error("GET /api/company-lookup failed:", status);
    const message =
      status === 401 || status === 403
        ? "Company search needs a free Brandfetch client id. Add BRANDFETCH_CLIENT_ID."
        : status === 429
          ? "Too many lookups. Wait a minute and try again."
          : "Could not look up that company.";
    return NextResponse.json(
      { error: message },
      { status: status === 402 ? 429 : status >= 400 && status < 600 ? status : 502 },
    );
  }
}
