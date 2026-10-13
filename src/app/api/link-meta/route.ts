import { NextResponse, type NextRequest } from "next/server";
import { linkTitle } from "@/lib/link-meta";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("url") ?? "";
  const title = await linkTitle(raw);
  return NextResponse.json(
    { title },
    { headers: { "Cache-Control": "private, max-age=3600" } },
  );
}
