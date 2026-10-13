export type LinkedInPreview = {
  linkedIn: string;
  notes?: string;
  imageUrl?: string;
};

/** Profile, company, school, or showcase, with optional extra segments such as /home. */
const PROFILE_PATH =
  /^\/(in|company|school|showcase)\/([^/?#]+)(?:\/.*)?$/i;

function profilePathname(pathname: string): string | null {
  const path = pathname.replace(/\/+$/, "") || "/";
  const match = PROFILE_PATH.exec(path);
  if (!match) return null;
  return `/${match[1]}/${match[2]}`;
}

function isLinkedInHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "linkedin.com" || host.endsWith(".linkedin.com");
}

function isShortHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "lnkd.in" || host.endsWith(".lnkd.in");
}

/** Profile or company URL, or a lnkd.in short link that can redirect to one. */
export function linkedInTarget(input: string): URL | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  let url: URL;
  try {
    url = new URL(
      /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`,
    );
  } catch {
    return null;
  }
  if (url.username || url.password) return null;
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  url.protocol = "https:";
  url.hash = "";

  if (isShortHost(url.hostname)) return url;
  if (!isLinkedInHost(url.hostname)) return null;

  url.hostname = "www.linkedin.com";
  url.search = "";
  const pathname = profilePathname(url.pathname);
  if (!pathname) return null;
  url.pathname = pathname;
  return url;
}

export function canonicalLinkedInUrl(url: URL): string | null {
  if (!isLinkedInHost(url.hostname)) return null;
  const pathname = profilePathname(url.pathname);
  if (!pathname) return null;
  return `https://www.linkedin.com${pathname}`;
}

function decodeHtml(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCodePoint(Number(code)),
    )
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) =>
      String.fromCodePoint(parseInt(code, 16)),
    )
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function attr(tag: string, name: string): string | undefined {
  const match = tag.match(
    new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i"),
  );
  const value = match?.[2] ?? match?.[3];
  return value ? decodeHtml(value) : undefined;
}

function metaContent(html: string, property: string): string | undefined {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  const key = property.toLowerCase();
  for (const tag of tags) {
    const prop = (attr(tag, "property") ?? attr(tag, "name"))?.toLowerCase();
    if (prop !== key) continue;
    const content = attr(tag, "content")?.trim();
    if (content) return content;
  }
  return undefined;
}

/** Turn LinkedIn's preview blurb into a short note. */
export function cleanLinkedInDescription(raw: string): string {
  let text = raw.replace(/\s+/g, " ").trim();
  text = text.replace(/\s*View .+?profile on LinkedIn.*$/i, "").trim();
  text = text
    .replace(/\s*·\s*[\d,.]+\+?\s+connections on LinkedIn\.?$/i, "")
    .trim();
  text = text
    .replace(/^[^|]+\|\s*[\d,.]+\+?\s+followers on LinkedIn\.\s*/i, "")
    .trim();
  const parts = text
    .split(/\s*(?:·|\|)\s*/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 8);
  return parts.join("\n").slice(0, 2000);
}

function safeImageUrl(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return undefined;
  }
  if (url.protocol !== "https:") return undefined;
  const host = url.hostname.toLowerCase();
  if (host !== "licdn.com" && !host.endsWith(".licdn.com")) return undefined;
  return url.href;
}

function previewFromHtml(html: string, linkedIn: string): LinkedInPreview {
  const title = metaContent(html, "og:title") ?? "";
  if (/profile not found|sign in|join linkedin/i.test(title)) {
    return { linkedIn };
  }
  const notes = cleanLinkedInDescription(
    metaContent(html, "og:description") ?? "",
  );
  const imageUrl = safeImageUrl(
    metaContent(html, "og:image") ?? metaContent(html, "twitter:image"),
  );
  return {
    linkedIn,
    ...(notes ? { notes } : {}),
    ...(imageUrl ? { imageUrl } : {}),
  };
}

async function readLinkedInHtml(start: URL): Promise<{ html: string; finalUrl: URL }> {
  let current = start;
  for (let hop = 0; hop < 5; hop++) {
    const response = await fetch(current.href, {
      redirect: "manual",
      cache: "no-store",
      headers: {
        // LinkedIn includes the photo and blurb for link-preview clients.
        "User-Agent":
          "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
        Accept: "text/html",
        "Accept-Language": "en",
      },
      signal: AbortSignal.timeout(12_000),
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) break;
      const next = new URL(location, current);
      if (!isLinkedInHost(next.hostname) && !isShortHost(next.hostname)) break;
      current = next;
      continue;
    }
    if (!response.ok) break;
    return { html: await response.text(), finalUrl: current };
  }
  return { html: "", finalUrl: current };
}

function previewError(message: string, status: number): Error {
  const error = new Error(message);
  (error as Error & { status: number }).status = status;
  return error;
}

export async function fetchLinkedInPreview(start: URL): Promise<LinkedInPreview> {
  const { html, finalUrl } = await readLinkedInHtml(start);
  const linkedIn =
    canonicalLinkedInUrl(finalUrl) ?? canonicalLinkedInUrl(start);
  if (!linkedIn) {
    throw previewError("Not a LinkedIn profile or company link", 400);
  }
  if (!html) {
    throw previewError("Could not read that LinkedIn page", 502);
  }
  const preview = previewFromHtml(html, linkedIn);
  if (!preview.notes && !preview.imageUrl) {
    throw previewError("Could not read that LinkedIn page", 502);
  }
  return preview;
}
