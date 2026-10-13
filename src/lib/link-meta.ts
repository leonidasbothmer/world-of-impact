import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { httpUrl } from "@/lib/link-display";

const BLOCKED_TITLE =
  /\b(?:403|404)\b|just a moment|access denied|sign in|log in|forbidden|not found|attention required|cloudflare|enable javascript/i;

const cache = new Map<string, { title: string | null; expires: number }>();

function isPrivateAddress(ip: string): boolean {
  const normalized = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    normalized === "::1" ||
    normalized === "0:0:0:0:0:0:0:1" ||
    normalized.startsWith("fe80:") ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd")
  ) {
    return true;
  }
  const v4 = normalized.startsWith("::ffff:") ? normalized.slice("::ffff:".length) : normalized;
  const parts = v4.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

async function assertPublic(url: URL): Promise<void> {
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host === "metadata.google.internal"
  ) {
    throw new Error("blocked");
  }
  if (isIP(host)) {
    if (isPrivateAddress(host)) throw new Error("blocked");
    return;
  }
  const records = await lookup(host, { all: true, verbatim: true });
  if (records.length === 0 || records.some((record) => isPrivateAddress(record.address))) {
    throw new Error("blocked");
  }
}

function decodeHtml(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
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
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i"));
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

function usableTitle(raw: string | undefined): string | null {
  if (!raw) return null;
  const clean = decodeHtml(raw).replace(/\s+/g, " ").trim();
  if (clean.length < 2 || clean.length > 80) return null;
  if (BLOCKED_TITLE.test(clean)) return null;
  if (/^(home|homepage|welcome|untitled)$/i.test(clean)) return null;
  return clean;
}

export function pageTitle(html: string): string | null {
  const site = usableTitle(metaContent(html, "og:site_name"));
  if (site && site.length <= 40) return site;
  const title =
    usableTitle(metaContent(html, "og:title")) ??
    usableTitle(html.match(/<title[^>]*>([^<]{1,200})<\/title>/i)?.[1]);
  if (!title) return null;
  if (title.length <= 48) return title;
  const head = title.split(/\s+[|–—]\s+|\s+[-:]\s+/)[0]?.trim();
  if (head && head.length >= 2 && head.length <= 40 && !BLOCKED_TITLE.test(head)) {
    return head;
  }
  return null;
}

async function readLimited(response: Response, max: number): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (size < max) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      chunks.push(value);
      size += value.byteLength;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  const merged = new Uint8Array(Math.min(size, max));
  let offset = 0;
  for (const chunk of chunks) {
    const take = Math.min(chunk.byteLength, merged.byteLength - offset);
    if (take <= 0) break;
    merged.set(chunk.subarray(0, take), offset);
    offset += take;
  }
  return new TextDecoder().decode(merged);
}

async function readHtml(start: URL): Promise<string> {
  let current = start;
  for (let hop = 0; hop < 4; hop++) {
    await assertPublic(current);
    const response = await fetch(current.href, {
      redirect: "manual",
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "Mozilla/5.0 (compatible; LinkPreview/1.0)",
      },
      signal: AbortSignal.timeout(6000),
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) return "";
      const next = new URL(location, current);
      if (next.protocol !== "http:" && next.protocol !== "https:") return "";
      if (next.username || next.password) return "";
      current = next;
      continue;
    }
    if (!response.ok) return "";
    const type = response.headers.get("content-type") ?? "";
    if (type && !/html|xml/i.test(type)) return "";
    return readLimited(response, 80_000);
  }
  return "";
}

/** Page title for a public http(s) URL, or null when it can't be read. */
export async function linkTitle(raw: string): Promise<string | null> {
  const url = httpUrl(raw);
  if (!url) return null;
  const key = url.href;
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.title;

  let title: string | null = null;
  try {
    const html = await readHtml(url);
    title = html ? pageTitle(html) : null;
    if (title && title.toLowerCase() === url.hostname.replace(/^www\./i, "").toLowerCase()) {
      title = null;
    }
  } catch {
    title = null;
  }
  cache.set(key, {
    title,
    expires: Date.now() + (title ? 24 : 1) * 60 * 60 * 1000,
  });
  return title;
}
