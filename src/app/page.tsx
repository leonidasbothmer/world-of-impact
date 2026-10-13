import { MindMapApp } from "@/components/mindmap-app";
import type { AccountProfile } from "@/components/account-menu";
import { readMindMap } from "@/lib/mindmap-store";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function accountNameFromUser(user: User) {
  const meta = user.user_metadata ?? {};
  for (const key of ["full_name", "name", "display_name"]) {
    const value = meta[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  const local = user.email?.split("@")[0]?.trim();
  if (!local) return "Account";
  return local
    .replace(/[._+-]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function metaText(meta: User["user_metadata"], key: string): string {
  const value = meta?.[key];
  return typeof value === "string" ? value : "";
}

export default async function Home() {
  const authEnabled = isSupabaseConfigured();
  let signedIn = false;
  let accountProfile: AccountProfile | null = null;
  if (authEnabled) {
    try {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      signedIn = Boolean(user);
      if (user) {
        accountProfile = {
          name: accountNameFromUser(user),
          linkedIn: metaText(user.user_metadata, "linkedin"),
          company: metaText(user.user_metadata, "company"),
          position: metaText(user.user_metadata, "position"),
        };
      }
    } catch {
      signedIn = false;
    }
  }

  let initialData = null;
  try {
    initialData = await readMindMap();
  } catch (error) {
    console.error("Failed to load mind map for SSR:", error);
  }

  return (
    <div className="h-dvh overflow-hidden">
      <MindMapApp
        initialData={initialData}
        authEnabled={authEnabled}
        signedIn={signedIn}
        accountProfile={accountProfile}
      />
    </div>
  );
}
