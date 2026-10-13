export type LinkPresentation = {
  href: string;
  host: string;
  label: string;
  linkedIn: boolean;
};

const LINKEDIN_SEGMENTS = new Set([
  "company",
  "in",
  "school",
  "showcase",
  "posts",
  "feed",
  "home",
]);

export function httpUrl(value: string): URL | null {
  const trimmed = value.trim();
  if (!trimmed || /\s/.test(trimmed)) return null;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }
  if (url.username || url.password) return null;
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  const host = url.hostname.replace(/^www\./i, "").toLowerCase();
  if (!host || (!host.includes(".") && !host.includes(":"))) return null;
  url.hash = "";
  return url;
}

function titleCaseSlug(slug: string): string {
  let text = slug;
  try {
    text = decodeURIComponent(slug);
  } catch {
    text = slug;
  }
  return text
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function linkedInLabel(pathname: string): string | null {
  const parts = pathname.split("/").filter(Boolean);
  const slug = [...parts]
    .reverse()
    .find((part) => !LINKEDIN_SEGMENTS.has(part.toLowerCase()));
  if (!slug) return null;
  const label = titleCaseSlug(slug);
  return label || null;
}

/** Short label for a table cell: site host, or a LinkedIn name from the URL. */
export function describeLink(value: string): LinkPresentation | null {
  const url = httpUrl(value);
  if (!url) return null;
  const host = url.hostname.replace(/^www\./i, "").toLowerCase();
  const linkedIn =
    host === "linkedin.com" ||
    host.endsWith(".linkedin.com") ||
    host === "lnkd.in";
  let label = host;
  if (linkedIn) {
    label = linkedInLabel(url.pathname) ?? "LinkedIn";
  } else {
    const path = url.pathname.replace(/\/+$/, "");
    if (path && `${host}${path}`.length <= 32) label = `${host}${path}`;
  }
  return { href: url.href, host, label, linkedIn };
}
