import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ focusIds: [] });
  }
  try {
    const auth = await createClient();
    const {
      data: { user },
    } = await auth.auth.getUser();
    if (!user) {
      return NextResponse.json({ focusIds: [] });
    }
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("user_focus")
      .select("shared_node_id")
      .eq("user_id", user.id);
    if (error) throw error;
    return NextResponse.json({
      focusIds: (data ?? []).map((r) => r.shared_node_id as string),
    });
  } catch (error) {
    console.error("GET /api/focus failed:", error);
    return NextResponse.json(
      { error: "Failed to load focus" },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ focusIds: [] });
  }
  try {
    const auth = await createClient();
    const {
      data: { user },
    } = await auth.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = (await request.json()) as { focusIds?: string[] };
    const focusIds = Array.isArray(body.focusIds)
      ? [...new Set(body.focusIds.filter((id) => typeof id === "string"))]
      : [];

    const supabase = createServiceClient();
    const { error: delError } = await supabase
      .from("user_focus")
      .delete()
      .eq("user_id", user.id);
    if (delError) throw delError;

    if (focusIds.length > 0) {
      const { error: insError } = await supabase.from("user_focus").insert(
        focusIds.map((shared_node_id) => ({
          user_id: user.id,
          shared_node_id,
        })),
      );
      if (insError) throw insError;
    }

    return NextResponse.json({ focusIds });
  } catch (error) {
    console.error("PUT /api/focus failed:", error);
    return NextResponse.json(
      { error: "Failed to save focus" },
      { status: 500 },
    );
  }
}
