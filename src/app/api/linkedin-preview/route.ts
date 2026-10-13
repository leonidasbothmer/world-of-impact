import { NextResponse, type NextRequest } from "next/server";
import {
  fetchLinkedInPreview,
  linkedInTarget,
} from "@/lib/linkedin-preview";

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("url") ?? "";
  const target = linkedInTarget(raw);
  if (!target) {
    return NextResponse.json(
      { error: "Use a LinkedIn profile or company link." },
      { status: 400 },
    );
  }

  try {
    const preview = await fetchLinkedInPreview(target);
    return NextResponse.json(preview);
  } catch (error) {
    const status =
      error &&
      typeof error === "object" &&
      "status" in error &&
      typeof (error as { status: unknown }).status === "number"
        ? (error as { status: number }).status
        : 502;
    if (status !== 400) {
      console.error("GET /api/linkedin-preview failed:", error);
    }
    return NextResponse.json(
      {
        error:
          status === 400
            ? "Use a LinkedIn profile or company link."
            : "Could not read that LinkedIn page.",
      },
      { status },
    );
  }
}
