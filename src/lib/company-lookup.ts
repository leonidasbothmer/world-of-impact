import type { CompanyProfile } from "@/lib/company-fill";
import { careerUrlFromHtml, discoverCareerBoard } from "@/lib/job-boards";
import { httpUrl } from "@/lib/link-display";
import { readPublicPage } from "@/lib/link-meta";
import { canonicalLinkedInUrl, linkedInTarget } from "@/lib/linkedin-preview";

const HIT_TTL_MS = 24 * 60 * 60 * 1000;
const MISS_TTL_MS = 60 * 60 * 1000;

const cache = new Map<
  string,
  { expires: number; profile: CompanyProfile | null }
>();

const CAREER_PROBE = ["/careers", "/jobs", "/karriere"];

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const clean = value.replace(/\s+/g, " ").trim();
  return clean || null;
}

function websiteUrl(raw: string | null): string | undefined {
  if (!raw) return undefined;
  const url = httpUrl(raw);
  if (!url) return undefined;
  const host = url.hostname.toLowerCase();
  if (host === "linkedin.com" || host.endsWith(".linkedin.com")) return undefined;
  url.protocol = "https:";
  url.hash = "";
  url.search = "";
  return url.href;
}

function linkedInUrl(raw: string | null): string | undefined {
  if (!raw) return undefined;
  const target = linkedInTarget(raw);
  if (!target) return undefined;
  return canonicalLinkedInUrl(target) ?? undefined;
}

function attr(tag: string, name: string): string | undefined {
  const match = tag.match(
    new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i"),
  );
  const value = (match?.[2] ?? match?.[3] ?? "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .trim();
  return value || undefined;
}

function logoFromHtml(html: string, pageUrl: URL): string | undefined {
  const links = html.match(/<link\b[^>]*>/gi) ?? [];
  const icons: { href: string; score: number }[] = [];
  for (const tag of links) {
    const rel = (attr(tag, "rel") ?? "").toLowerCase();
    const href = attr(tag, "href");
    if (!href) continue;
    let score = 0;
    if (rel.includes("apple-touch-icon")) score = 3;
    else if (/(?:^|\s)icon(?:\s|$)/.test(rel) || rel.includes("shortcut")) score = 1;
    else continue;
    const size = Number((attr(tag, "sizes") ?? "").split("x")[0]);
    if (size >= 64) score += 1;
    icons.push({ href, score });
  }
  icons.sort((left, right) => right.score - left.score);
  for (const icon of icons) {
    try {
      const absolute = new URL(icon.href, pageUrl);
      const url = httpUrl(absolute.href);
      if (url) return url.href;
    } catch {
      continue;
    }
  }
  return undefined;
}

function favicon(website: string): string | undefined {
  const url = httpUrl(website);
  if (!url) return undefined;
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(url.hostname)}&sz=128`;
}

function isBoardUrl(value: string): boolean {
  const url = httpUrl(value);
  if (!url) return false;
  const host = url.hostname.toLowerCase();
  return (
    host.endsWith("greenhouse.io") ||
    host.endsWith("lever.co") ||
    host.endsWith("ashbyhq.com") ||
    host.endsWith("personio.de") ||
    host.endsWith("personio.com") ||
    host.endsWith("workable.com") ||
    host.endsWith("recruitee.com") ||
    host.endsWith("smartrecruiters.com") ||
    host.endsWith("teamtailor.com") ||
    host === "join.com"
  );
}

async function careerFromSite(
  website: string,
  name: string,
  html: string,
  pageUrl: URL,
): Promise<string | undefined> {
  const linked = careerUrlFromHtml(html, pageUrl);
  if (linked && isBoardUrl(linked)) return linked;
  const board = await discoverCareerBoard(name, website);
  if (board && board.jobs > 0) return board.page;
  if (linked) return linked;
  const origin = httpUrl(website);
  if (!origin) return board?.page;
  origin.pathname = "/";
  origin.search = "";
  origin.hash = "";
  const pages = await Promise.all(
    CAREER_PROBE.map((path) => {
      const probe = new URL(origin.href);
      probe.pathname = path;
      return readPublicPage(probe.href, { maxBytes: 200_000, timeoutMs: 6000 });
    }),
  );
  for (const page of pages) {
    if (!page) continue;
    const finalUrl = httpUrl(page.url);
    if (!finalUrl) continue;
    const host = finalUrl.hostname.replace(/^www\./i, "");
    const originHost = origin.hostname.replace(/^www\./i, "");
    const related =
      host === originHost ||
      host.endsWith(`.${originHost}`) ||
      originHost.endsWith(`.${host}`);
    if (!related) continue;
    const found = careerUrlFromHtml(page.html, finalUrl);
    if (found) return found;
    const path = finalUrl.pathname.split("/").some((part) =>
      /^(careers?|jobs|karriere)$/i.test(part),
    );
    if (path) return finalUrl.href;
  }
  return board?.page;
}

function compactName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function pickBrand(
  results: unknown[],
  query: string,
): { name: string; domain: string } | null {
  const needle = compactName(query);
  const rows: {
    name: string;
    domain: string;
    quality: number;
    score: number;
    exact: boolean;
  }[] = [];
  for (const item of results) {
    const record = asRecord(item);
    if (!record) continue;
    const name = asString(record.name);
    const domain = asString(record.domain);
    if (!name || !domain) continue;
    rows.push({
      name,
      domain,
      quality: typeof record.qualityScore === "number" ? record.qualityScore : 0,
      score: typeof record._score === "number" ? record._score : 0,
      exact: compactName(name) === needle,
    });
  }
  const exact = rows.filter((row) => row.exact);
  const pool = exact.length > 0 ? exact : rows;
  pool.sort((left, right) => right.quality - left.quality || right.score - left.score);
  const best = pool[0];
  if (!best) return null;
  if (!best.exact && best.quality < 0.45 && best.score < 30) return null;
  return { name: best.name, domain: best.domain };
}

function linkedInFromHtml(html: string, pageUrl: URL): string | undefined {
  const tags = html.match(/<a\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const match = tag.match(/\bhref\s*=\s*("([^"]*)"|'([^']*)')/i);
    const href = (match?.[2] ?? match?.[3] ?? "")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .trim();
    if (!href || !/linkedin/i.test(href)) continue;
    let absolute: string;
    try {
      absolute = new URL(href, pageUrl).href;
    } catch {
      continue;
    }
    const linkedIn = linkedInUrl(absolute);
    if (linkedIn?.includes("/company/")) return linkedIn;
  }
  return undefined;
}

async function withSiteDetails(profile: CompanyProfile): Promise<CompanyProfile> {
  if (!profile.website) return profile;
  const home = await readPublicPage(profile.website);
  let careerPage: string | undefined;
  let imageUrl: string | undefined;
  const fallbackPage = httpUrl(profile.website);
  const pageUrl = (home && httpUrl(home.url)) || fallbackPage;
  let linkedIn = profile.linkedIn;
  if (pageUrl) {
    careerPage = await careerFromSite(
      profile.website,
      profile.matchedName,
      home?.html ?? "",
      pageUrl,
    );
    if (home) {
      imageUrl = logoFromHtml(home.html, pageUrl);
      linkedIn = linkedIn ?? linkedInFromHtml(home.html, pageUrl);
    }
  }
  imageUrl = imageUrl ?? favicon(profile.website);
  return {
    ...profile,
    ...(careerPage ? { careerPage } : {}),
    ...(imageUrl ? { imageUrl } : {}),
    ...(linkedIn ? { linkedIn } : {}),
  };
}

function cacheKey(name: string, website: string | undefined): string {
  const host = website ? (httpUrl(website)?.hostname.replace(/^www\./i, "").toLowerCase() ?? "") : "";
  return `${name.trim().toLowerCase().replace(/\s+/g, " ")}|${host}`;
}

async function fetchCompany(name: string): Promise<CompanyProfile | null> {
  const endpoint = new URL(
    `https://api.brandfetch.io/v2/search/${encodeURIComponent(name)}`,
  );
  const clientId = process.env.BRANDFETCH_CLIENT_ID?.trim();
  if (clientId) endpoint.searchParams.set("c", clientId);
  const response = await fetch(endpoint, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(12_000),
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    throw Object.assign(new Error("Company search failed"), {
      status: response.status,
    });
  }
  const body = (await response.json()) as unknown;
  if (!Array.isArray(body)) return null;
  const brand = pickBrand(body, name);
  if (!brand) return null;
  const website = websiteUrl(brand.domain);
  if (!website) return null;
  return { matchedName: brand.name, website };
}

/** Name to website, then the company's own site for the career page, LinkedIn, and logo. */
export async function lookupCompany(
  name: string,
  website: string | undefined,
): Promise<CompanyProfile | null> {
  const key = cacheKey(name, website);
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.profile;

  const knownSite = website ? websiteUrl(website) : undefined;
  const matched = knownSite
    ? { matchedName: name, website: knownSite }
    : await fetchCompany(name);
  if (!matched) {
    cache.set(key, { profile: null, expires: Date.now() + MISS_TTL_MS });
    return null;
  }
  try {
    const profile = await withSiteDetails(matched);
    cache.set(key, {
      profile,
      expires: Date.now() + (profile.careerPage ? HIT_TTL_MS : 5 * 60 * 1000),
    });
    return profile;
  } catch {
    cache.set(key, { profile: matched, expires: Date.now() + HIT_TTL_MS });
    return matched;
  }
}
