import { httpUrl } from "@/lib/link-display";
import { appendLocation } from "@/lib/locations";
import type { MindMapNode } from "@/types/mindmap";

/** Fields worth copying onto an organization when applying. */
export type CompanyProfile = {
  matchedName: string;
  website?: string;
  linkedIn?: string;
  careerPage?: string;
  imageUrl?: string;
  orgKind?: string;
  location?: string;
};

export type AppliedCompany = {
  node: MindMapNode;
  filled: string[];
  message: string;
};

function siteHost(value: string | undefined): string | null {
  if (!value) return null;
  const url = httpUrl(value);
  if (!url) return null;
  return url.hostname.replace(/^www\./i, "").toLowerCase();
}

function joinLabels(labels: string[]): string {
  if (labels.length <= 1) return labels[0] ?? "";
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
}

/** Copy lookup fields onto empty organization fields. Existing values stay. */
export function applyCompanyProfile(
  node: MindMapNode,
  profile: CompanyProfile,
): AppliedCompany {
  const savedHost = siteHost(node.website);
  const matchedHost = siteHost(profile.website);
  if (savedHost && matchedHost && savedHost !== matchedHost) {
    return {
      node,
      filled: [],
      message: `Matched ${profile.matchedName} (${profile.website}), a different website from the one saved.`,
    };
  }

  const next: MindMapNode = { ...node };
  const filled: string[] = [];
  if (!next.website?.trim() && profile.website) {
    next.website = profile.website;
    filled.push("website");
  }
  if (!next.careerPage?.trim() && profile.careerPage) {
    next.careerPage = profile.careerPage;
    filled.push("career page");
  }
  if (!next.linkedIn?.trim() && profile.linkedIn) {
    next.linkedIn = profile.linkedIn;
    filled.push("LinkedIn");
  }
  if (!next.imageUrl?.trim() && profile.imageUrl) {
    next.imageUrl = profile.imageUrl;
    filled.push("logo");
  }
  if (!next.orgKind?.trim() && profile.orgKind) {
    next.orgKind = profile.orgKind;
    filled.push("kind");
  }
  if ((next.locations?.length ?? 0) === 0 && profile.location) {
    const locations = appendLocation(next.locations, profile.location);
    if (locations) {
      next.locations = locations;
      filled.push("location");
    }
  }

  return {
    node: next,
    filled,
    message: filled.length
      ? `Filled ${joinLabels(filled)} from ${profile.matchedName}.`
      : `Nothing new to add for ${profile.matchedName}.`,
  };
}

export async function requestCompanyLookup(input: {
  name: string;
  website?: string;
}): Promise<{ ok: true; profile: CompanyProfile } | { ok: false; error: string }> {
  const params = new URLSearchParams({ name: input.name.trim() });
  const website = input.website?.trim();
  if (website) params.set("website", website);
  try {
    const response = await fetch(`/api/company-lookup?${params}`);
    const body = (await response.json()) as {
      profile?: CompanyProfile;
      error?: string;
    };
    if (!response.ok || !body.profile?.matchedName) {
      return { ok: false, error: body.error || "Could not look up that company." };
    }
    return { ok: true, profile: body.profile };
  } catch {
    return { ok: false, error: "Could not look up that company." };
  }
}
