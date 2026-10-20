import { httpUrl } from "@/lib/link-display";
import { readPublicText } from "@/lib/link-meta";

export type ListedJob = {
  id: string;
  title: string;
  location: string | null;
  department: string | null;
  url: string;
  /** Calendar date the role was posted, YYYY-MM-DD. */
  postedOn: string | null;
};

export type CareerRead = {
  status: "ok" | "empty" | "unread";
  jobs: ListedJob[];
};

type Board =
  | { source: "greenhouse"; token: string }
  | { source: "lever"; site: string; eu: boolean }
  | { source: "ashby"; board: string }
  | { source: "smartrecruiters"; company: string }
  | { source: "workable"; account: string }
  | { source: "recruitee"; company: string }
  | { source: "recruitee-id"; companyId: string }
  | { source: "personio"; host: string; language: string | null }
  | { source: "teamtailor"; host: string }
  | { source: "join"; slug: string };

const RECRUITEE_HOSTS = new Set([
  "www",
  "api",
  "careers",
  "jobs",
  "jobs-widget",
  "careers-analytics",
]);

const cache = new Map<string, { expires: number; read: CareerRead }>();
const inflight = new Map<string, Promise<CareerRead>>();

const OK_TTL_MS = 6 * 60 * 60 * 1000;
const MISS_TTL_MS = 30 * 60 * 1000;

function cacheKey(raw: string): string {
  const url = httpUrl(raw);
  if (!url) return raw.trim();
  url.hostname = url.hostname.toLowerCase();
  return url.href;
}

export async function readCareerPage(careerPage: string): Promise<CareerRead> {
  const key = cacheKey(careerPage);
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.read;
  const pending = inflight.get(key);
  if (pending) return pending;
  const promise = loadCareerPage(careerPage)
    .then((read) => {
      cache.set(key, {
        read,
        expires: Date.now() + (read.status === "unread" ? MISS_TTL_MS : OK_TTL_MS),
      });
      return read;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, promise);
  return promise;
}

async function loadCareerPage(careerPage: string): Promise<CareerRead> {
  const url = httpUrl(careerPage);
  if (!url) return { status: "unread", jobs: [] };
  try {
    const fromUrl = detectBoard(url.href, url);
    if (fromUrl) return fromFetch(await fetchBoard(fromUrl));
    const html = await readPublicText(url.href, {
      maxBytes: 6_000_000,
      accept: "text/html,application/xhtml+xml",
      timeoutMs: 12_000,
    });
    if (!html) return { status: "unread", jobs: [] };
    const plain = unescapeSlashes(html);
    const fromHtml = detectBoard(plain, url);
    if (fromHtml) return fromFetch(await fetchBoard(fromHtml));
    const structured = dedupeJobs([
      ...jsonLdJobs(plain),
      ...embeddedGreenhouseJobs(plain),
    ]);
    if (structured.length === 0) return { status: "unread", jobs: [] };
    return { status: "ok", jobs: structured };
  } catch {
    return { status: "unread", jobs: [] };
  }
}

type BoardFetch = { ok: true; jobs: ListedJob[] } | { ok: false };

/** Career pages often embed board URLs inside one or two layers of JSON escaping. */
function unescapeSlashes(value: string): string {
  let text = value;
  for (let pass = 0; pass < 3; pass++) {
    const next = text.replace(/\\u002F/gi, "/").replace(/\\\//g, "/");
    if (next === text) break;
    text = next;
  }
  return text;
}

function fromFetch(result: BoardFetch): CareerRead {
  if (!result.ok) return { status: "unread", jobs: [] };
  const jobs = dedupeJobs(result.jobs);
  return { status: jobs.length > 0 ? "ok" : "empty", jobs };
}

function detectBoard(text: string, pageUrl: URL): Board | null {
  const greenhouse = text.match(
    /boards(?:\.eu)?\.greenhouse\.io\/embed\/job_board(?:\/js)?\?[^"'<\s]*\bfor=([a-z0-9_-]+)/i,
  );
  if (greenhouse) return { source: "greenhouse", token: greenhouse[1] };
  const jobBoard = text.match(
    /job-boards(?:\.eu)?\.greenhouse\.io\/([a-z0-9_-]+)/i,
  );
  if (jobBoard && jobBoard[1].toLowerCase() !== "embed") {
    return { source: "greenhouse", token: jobBoard[1] };
  }
  const classic = text.match(/boards(?:\.eu)?\.greenhouse\.io\/([a-z0-9_-]+)/i);
  if (
    classic &&
    !["embed", "css", "js", "job_board"].includes(classic[1].toLowerCase())
  ) {
    return { source: "greenhouse", token: classic[1] };
  }

  const ashby = text.match(/jobs\.ashbyhq\.com\/([a-z0-9_-]+)/i);
  if (ashby && ashby[1].toLowerCase() !== "embed") {
    return { source: "ashby", board: ashby[1] };
  }

  const personio = text.match(
    /([a-z0-9-]+)\.jobs\.personio\.(de|com)/i,
  );
  if (personio) {
    const host = `${personio[1].toLowerCase()}.jobs.personio.${personio[2].toLowerCase()}`;
    const language =
      pageUrl.searchParams.get("language") ??
      text.match(/jobs\.personio\.(?:de|com)\/?\?[^"'<\s]*\blanguage=([a-z]{2})/i)?.[1] ??
      null;
    return { source: "personio", host, language };
  }

  const recruitee = text.match(/https?:\/\/([a-z0-9-]+)\.recruitee\.com/i);
  if (recruitee && !RECRUITEE_HOSTS.has(recruitee[1].toLowerCase())) {
    return { source: "recruitee", company: recruitee[1].toLowerCase() };
  }
  if (/recruitee/i.test(text)) {
    const companyId = text.match(/"companies"\s*:\s*\[\s*(\d+)\s*\]/);
    if (companyId) return { source: "recruitee-id", companyId: companyId[1] };
  }

  const teamtailor = text.match(/https?:\/\/([a-z0-9-]+)\.teamtailor\.com/i);
  if (teamtailor && teamtailor[1].toLowerCase() !== "www") {
    return { source: "teamtailor", host: `${teamtailor[1].toLowerCase()}.teamtailor.com` };
  }

  const lever = text.match(/jobs(\.eu)?\.lever\.co\/([a-z0-9_-]+)/i);
  if (lever) return { source: "lever", site: lever[2], eu: Boolean(lever[1]) };

  const workable = text.match(/apply\.workable\.com\/([a-z0-9_-]+)/i);
  if (workable && workable[1].toLowerCase() !== "api") {
    return { source: "workable", account: workable[1] };
  }

  const smartrecruiters = text.match(
    /(?:jobs|careers)\.smartrecruiters\.com\/([A-Za-z0-9_-]+)/,
  );
  if (smartrecruiters && smartrecruiters[1].toLowerCase() !== "about") {
    return { source: "smartrecruiters", company: smartrecruiters[1] };
  }

  const join = text.match(/join\.com\/companies\/([a-z0-9-]+)/i);
  if (join) return { source: "join", slug: join[1].toLowerCase() };

  return null;
}

function boardPageUrl(board: Board): string | null {
  switch (board.source) {
    case "greenhouse":
      return `https://job-boards.greenhouse.io/${board.token}`;
    case "lever":
      return `https://${board.eu ? "jobs.eu" : "jobs"}.lever.co/${board.site}`;
    case "ashby":
      return `https://jobs.ashbyhq.com/${board.board}`;
    case "smartrecruiters":
      return `https://jobs.smartrecruiters.com/${board.company}`;
    case "workable":
      return `https://apply.workable.com/${board.account}`;
    case "recruitee":
      return `https://${board.company}.recruitee.com`;
    case "recruitee-id":
      return null;
    case "personio":
      return board.language
        ? `https://${board.host}?language=${board.language}`
        : `https://${board.host}`;
    case "teamtailor":
      return `https://${board.host}`;
    case "join":
      return `https://join.com/companies/${board.slug}`;
    default:
      return null;
  }
}

const CAREER_SEGMENT =
  /^(careers?|jobs|join(?:-us)?|work-with-us|open-positions|vacancies|karriere|stellenangebote)$/i;

function careerPath(url: URL): boolean {
  return url.pathname.split("/").some((part) => CAREER_SEGMENT.test(part));
}

function sameOrgHost(left: URL, right: URL): boolean {
  const a = left.hostname.toLowerCase().replace(/^www\./, "");
  const b = right.hostname.toLowerCase().replace(/^www\./, "");
  return a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`);
}

function hrefFromTag(tag: string): string | null {
  const match = tag.match(/\bhref\s*=\s*("([^"]*)"|'([^']*)')/i);
  const value = (match?.[2] ?? match?.[3] ?? "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .trim();
  return value || null;
}

/** Career page linked from HTML: an applicant-tracking board, or a same-site careers path. */
export function careerUrlFromHtml(html: string, pageUrl: URL): string | null {
  const plain = unescapeSlashes(html);
  const embedded = detectBoard(plain, pageUrl);
  const embeddedUrl = embedded ? boardPageUrl(embedded) : null;
  if (embeddedUrl) return embeddedUrl;

  let sameSite: string | null = null;
  const tags = plain.match(/<a\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const href = hrefFromTag(tag);
    if (!href || href.startsWith("#") || /^javascript:/i.test(href)) continue;
    if (/^(mailto|tel):/i.test(href)) continue;
    let url: URL;
    try {
      url = new URL(href, pageUrl);
    } catch {
      continue;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") continue;
    if (url.username || url.password) continue;
    const listed = detectBoard(url.href, url);
    const listedUrl = listed ? boardPageUrl(listed) : null;
    if (listedUrl) return listedUrl;
    if (!sameSite && sameOrgHost(url, pageUrl) && careerPath(url)) {
      url.hash = "";
      sameSite = url.href;
    }
  }
  return sameSite;
}

const RESERVED_SLUGS = new Set([
  "www",
  "app",
  "jobs",
  "job",
  "careers",
  "career",
  "karriere",
  "blog",
  "shop",
  "mail",
  "info",
  "home",
  "about",
  "company",
  "group",
  "team",
  "join",
  "work",
]);

type BoardHit = { page: string; jobs: number };

function careerSlugs(name: string, website: string): string[] {
  const url = httpUrl(website);
  const host = url?.hostname.replace(/^www\./i, "").toLowerCase() ?? "";
  const domain = host.split(".")[0] ?? "";
  const words = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const slugs: string[] = [];
  for (const raw of [domain, words.replace(/ /g, ""), words.replace(/ /g, "-")]) {
    const slug = raw.replace(/[^a-z0-9-]/g, "").replace(/^-+|-+$/g, "");
    if (slug.length < 3 || slug.length > 48 || RESERVED_SLUGS.has(slug)) continue;
    if (!slugs.includes(slug)) slugs.push(slug);
  }
  return slugs.slice(0, 2);
}

function accountMatches(accountName: string, slug: string): boolean {
  const compact = accountName.toLowerCase().replace(/[^a-z0-9]/g, "");
  const needle = slug.replace(/-/g, "");
  if (!compact || compact === "workable") return needle === "workable";
  return compact.includes(needle) || needle.includes(compact);
}

async function probeBody(
  url: string,
  accept: string,
): Promise<string> {
  return readPublicText(url, {
    maxBytes: 500_000,
    accept,
    timeoutMs: 6000,
  });
}

function listedCount(text: string, key: string): number | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    if (!new RegExp(`"${key}"\\s*:\\s*\\[`).test(text)) return null;
    const titles = text.match(/"title"|"text"/g);
    return titles && titles.length > 0 ? titles.length : 1;
  }
  const record = asRecord(parsed);
  const jobs = record?.[key];
  if (!Array.isArray(jobs)) return null;
  return jobs.length;
}

async function probeGreenhouse(slug: string): Promise<BoardHit | null> {
  const text = await probeBody(
    `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}/jobs`,
    "application/json",
  );
  if (!text) return null;
  const jobs = listedCount(text, "jobs");
  if (jobs == null) return null;
  return { page: `https://job-boards.greenhouse.io/${slug}`, jobs };
}

async function probeLever(slug: string, eu: boolean): Promise<BoardHit | null> {
  const api = eu ? "api.eu.lever.co" : "api.lever.co";
  const text = await probeBody(
    `https://${api}/v0/postings/${encodeURIComponent(slug)}?mode=json`,
    "application/json",
  );
  if (!text) return null;
  let jobs: number | null = null;
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!Array.isArray(parsed)) return null;
    jobs = parsed.length;
  } catch {
    if (!text.trimStart().startsWith("[")) return null;
    jobs = (text.match(/"text"/g) ?? []).length || 1;
  }
  const site = eu ? "jobs.eu.lever.co" : "jobs.lever.co";
  return { page: `https://${site}/${slug}`, jobs };
}

async function probeAshby(slug: string): Promise<BoardHit | null> {
  const text = await probeBody(
    `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(slug)}`,
    "application/json",
  );
  if (!text) return null;
  const jobs = listedCount(text, "jobs");
  if (jobs == null) return null;
  return { page: `https://jobs.ashbyhq.com/${slug}`, jobs };
}

async function probePersonio(slug: string, tld: "de" | "com"): Promise<BoardHit | null> {
  const host = `${slug}.jobs.personio.${tld}`;
  const xml = await probeBody(`https://${host}/xml`, "application/xml,text/xml,*/*");
  if (!xml || !/<workzag-jobs[\s>]/i.test(xml)) return null;
  const jobs = (xml.match(/<position[\s>]/gi) ?? []).length;
  return { page: `https://${host}`, jobs };
}

async function probeWorkable(slug: string): Promise<BoardHit | null> {
  const text = await probeBody(
    `https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(slug)}`,
    "application/json",
  );
  if (!text) return null;
  let account = "";
  let jobs: number | null = null;
  try {
    const record = asRecord(JSON.parse(text) as unknown);
    if (!record || !Array.isArray(record.jobs)) return null;
    account = asString(record.name) ?? "";
    jobs = record.jobs.length;
  } catch {
    return null;
  }
  if (!accountMatches(account, slug)) return null;
  return { page: `https://apply.workable.com/${slug}`, jobs };
}

async function probeRecruitee(slug: string): Promise<BoardHit | null> {
  const text = await probeBody(
    `https://${slug}.recruitee.com/api/offers/`,
    "application/json",
  );
  if (!text) return null;
  const jobs = listedCount(text, "offers");
  if (jobs == null) return null;
  return { page: `https://${slug}.recruitee.com`, jobs };
}

/** Public job board for this company, found from its name and domain. */
export async function discoverCareerBoard(
  name: string,
  website: string,
): Promise<BoardHit | null> {
  const slugs = careerSlugs(name, website);
  if (slugs.length === 0) return null;
  const hits = (
    await Promise.all(
      slugs.flatMap((slug) => [
        probeGreenhouse(slug),
        probeLever(slug, false),
        probeLever(slug, true),
        probeAshby(slug),
        probePersonio(slug, "de"),
        probePersonio(slug, "com"),
        probeWorkable(slug),
        probeRecruitee(slug),
      ]),
    )
  ).filter((hit): hit is BoardHit => hit != null);
  hits.sort((left, right) => right.jobs - left.jobs);
  return hits[0] ?? null;
}

async function fetchBoard(board: Board): Promise<BoardFetch> {
  switch (board.source) {
    case "greenhouse":
      return greenhouseJobs(board.token);
    case "lever":
      return leverJobs(board.site, board.eu);
    case "ashby":
      return ashbyJobs(board.board);
    case "smartrecruiters":
      return smartRecruitersJobs(board.company);
    case "workable":
      return workableJobs(board.account);
    case "recruitee":
      return recruiteeJobs(`https://${board.company}.recruitee.com/api/offers/`);
    case "recruitee-id":
      return recruiteeJobs(
        `https://api.recruitee.com/c/${board.companyId}/careers/offers`,
      );
    case "personio":
      return personioJobs(board.host, board.language);
    case "teamtailor":
      return teamtailorJobs(board.host);
    case "join":
      return joinJobs(board.slug);
    default:
      return { ok: false };
  }
}

async function readJson(url: string): Promise<unknown> {
  const text = await readPublicText(url, {
    maxBytes: 8_000_000,
    accept: "application/json,text/plain,*/*",
    timeoutMs: 15_000,
  });
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const clean = decodeXml(value).replace(/\s+/g, " ").trim();
  return clean || null;
}

function postedOn(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString().slice(0, 10);
  }
  const text = asString(value);
  if (!text) return null;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function jobUrl(value: unknown): string | null {
  const text = asString(value);
  if (!text) return null;
  const url = httpUrl(text);
  return url?.href ?? null;
}

function listedJob(input: {
  id: string;
  title: string | null;
  location: string | null;
  department: string | null;
  url: string | null;
  postedOn: string | null;
}): ListedJob | null {
  if (!input.title || !input.url) return null;
  return {
    id: input.id.slice(0, 200),
    title: input.title.slice(0, 180),
    location: input.location?.slice(0, 160) ?? null,
    department: input.department?.slice(0, 160) ?? null,
    url: input.url,
    postedOn: input.postedOn,
  };
}

function dedupeJobs(jobs: ListedJob[]): ListedJob[] {
  const seen = new Set<string>();
  const unique: ListedJob[] = [];
  for (const job of jobs) {
    const key = job.id || job.url;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(job);
  }
  return unique.slice(0, 1000);
}

async function greenhouseJobs(token: string): Promise<BoardFetch> {
  const body = asRecord(
    await readJson(
      `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs`,
    ),
  );
  const jobs = body?.jobs;
  if (!Array.isArray(jobs)) return { ok: false };
  return { ok: true, jobs: jobs.flatMap((entry) => {
    const job = asRecord(entry);
    if (!job) return [];
    const id = job.id == null ? null : String(job.id);
    const location = asRecord(job.location);
    const departments = Array.isArray(job.departments)
      ? job.departments
          .map((item) => asString(asRecord(item)?.name))
          .filter((name): name is string => Boolean(name))
      : [];
    const listed = listedJob({
      id: `greenhouse:${token}:${id ?? jobUrl(job.absolute_url)}`,
      title: asString(job.title),
      location: asString(location?.name),
      department: departments.join(", ") || null,
      url: jobUrl(job.absolute_url),
      postedOn: postedOn(job.first_published),
    });
    return listed ? [listed] : [];
  }) };
}

async function leverJobs(site: string, eu: boolean): Promise<BoardFetch> {
  const host = eu ? "api.eu.lever.co" : "api.lever.co";
  const body = await readJson(
    `https://${host}/v0/postings/${encodeURIComponent(site)}?mode=json`,
  );
  if (!Array.isArray(body)) return { ok: false };
  return { ok: true, jobs: body.flatMap((entry) => {
    const job = asRecord(entry);
    if (!job) return [];
    const categories = asRecord(job.categories);
    const listed = listedJob({
      id: `lever:${site}:${asString(job.id) ?? jobUrl(job.hostedUrl)}`,
      title: asString(job.text),
      location: asString(categories?.location),
      department:
        asString(categories?.department) ?? asString(categories?.team),
      url: jobUrl(job.hostedUrl),
      postedOn: postedOn(job.createdAt),
    });
    return listed ? [listed] : [];
  }) };
}

async function ashbyJobs(board: string): Promise<BoardFetch> {
  const body = asRecord(
    await readJson(
      `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(board)}`,
    ),
  );
  const jobs = body?.jobs;
  if (!Array.isArray(jobs)) return { ok: false };
  return { ok: true, jobs: jobs.flatMap((entry) => {
    const job = asRecord(entry);
    if (!job || job.isListed === false) return [];
    const id = asString(job.id);
    const listed = listedJob({
      id: `ashby:${board}:${id ?? jobUrl(job.jobUrl)}`,
      title: asString(job.title),
      location: asString(job.location),
      department: asString(job.department) ?? asString(job.team),
      url: jobUrl(job.jobUrl) ?? (id ? `https://jobs.ashbyhq.com/${board}/${id}` : null),
      postedOn: postedOn(job.publishedAt),
    });
    return listed ? [listed] : [];
  }) };
}

async function smartRecruitersJobs(company: string): Promise<BoardFetch> {
  const jobs: ListedJob[] = [];
  let sawPage = false;
  for (let offset = 0; offset < 300; offset += 100) {
    const body = asRecord(
      await readJson(
        `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(company)}/postings?limit=100&offset=${offset}`,
      ),
    );
    const content = body?.content;
    if (!Array.isArray(content)) return { ok: false };
    sawPage = true;
    if (content.length === 0) break;
    for (const entry of content) {
      const job = asRecord(entry);
      if (!job) continue;
      const id = asString(job.id);
      const location = asRecord(job.location);
      const place = [location?.city, location?.region, location?.country]
        .map(asString)
        .filter((part): part is string => Boolean(part))
        .join(", ");
      const department = asRecord(job.department);
      const listed = listedJob({
        id: `smartrecruiters:${company}:${id}`,
        title: asString(job.name),
        location: place || (location?.remote === true ? "Remote" : null),
        department: asString(department?.label),
        url: id
          ? `https://jobs.smartrecruiters.com/${encodeURIComponent(company)}/${encodeURIComponent(id)}`
          : null,
        postedOn: postedOn(job.releasedDate),
      });
      if (listed) jobs.push(listed);
    }
    if (content.length < 100) break;
  }
  return sawPage ? { ok: true, jobs } : { ok: false };
}

async function workableJobs(account: string): Promise<BoardFetch> {
  const body = asRecord(
    await readJson(
      `https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(account)}`,
    ),
  );
  const jobs = body?.jobs;
  if (!Array.isArray(jobs)) return { ok: false };
  return { ok: true, jobs: jobs.flatMap((entry) => {
    const job = asRecord(entry);
    if (!job) return [];
    const place = [job.city, job.country]
      .map(asString)
      .filter((part): part is string => Boolean(part))
      .join(", ");
    const listed = listedJob({
      id: `workable:${account}:${asString(job.shortcode) ?? jobUrl(job.url)}`,
      title: asString(job.title),
      location: place || null,
      department: asString(job.department),
      url: jobUrl(job.url),
      postedOn: postedOn(job.published_on ?? job.created_at),
    });
    return listed ? [listed] : [];
  }) };
}

async function recruiteeJobs(endpoint: string): Promise<BoardFetch> {
  const body = asRecord(await readJson(endpoint));
  const offers = body?.offers;
  if (!Array.isArray(offers)) return { ok: false };
  return { ok: true, jobs: offers.flatMap((entry) => {
    const offer = asRecord(entry);
    if (!offer) return [];
    const status = asString(offer.status);
    if (status && status !== "published") return [];
    const city = asString(offer.city);
    const country = asString(offer.country);
    const location = asString(offer.location);
    const listed = listedJob({
      id: `recruitee:${offer.id ?? jobUrl(offer.careers_url)}`,
      title: asString(offer.title),
      location: [city, country].filter(Boolean).join(", ") || location,
      department: asString(offer.department),
      url: jobUrl(offer.careers_url),
      postedOn: postedOn(offer.published_at ?? offer.created_at),
    });
    return listed ? [listed] : [];
  }) };
}

async function personioJobs(
  host: string,
  language: string | null,
): Promise<BoardFetch> {
  const xml = await readPublicText(`https://${host}/xml`, {
    maxBytes: 8_000_000,
    accept: "application/xml,text/xml,*/*",
    timeoutMs: 15_000,
  });
  if (!xml || !/<workzag-jobs[\s>]/i.test(xml)) return { ok: false };
  const jobs: ListedJob[] = [];
  for (const match of xml.matchAll(/<position>([\s\S]*?)<\/position>/gi)) {
    const block = match[1];
    const id = xmlTag(block, "id");
    if (!id) continue;
    const offices = xmlTags(block, "office");
    const query = language ? `?language=${encodeURIComponent(language)}` : "";
    const listed = listedJob({
      id: `personio:${host}:${id}`,
      title: xmlTag(block, "name"),
      location: [...new Set(offices)].join(", ") || null,
      department: xmlTag(block, "department"),
      url: `https://${host}/job/${encodeURIComponent(id)}${query}`,
      postedOn: postedOn(xmlTag(block, "createdAt")),
    });
    if (listed) jobs.push(listed);
  }
  return { ok: true, jobs };
}

async function teamtailorJobs(host: string): Promise<BoardFetch> {
  const xml = await readPublicText(`https://${host}/jobs.rss`, {
    maxBytes: 4_000_000,
    accept: "application/rss+xml,application/xml,text/xml,*/*",
    timeoutMs: 12_000,
  });
  if (!xml || !/<rss[\s>]/i.test(xml)) return { ok: false };
  const jobs: ListedJob[] = [];
  for (const match of xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)) {
    const block = match[1];
    const url = jobUrl(xmlTag(block, "link"));
    if (!url || /\/applications\//.test(url)) continue;
    const id = url.match(/\/jobs\/(\d+)/)?.[1] ?? url;
    const places = xmlTags(block, "tt:name");
    const listed = listedJob({
      id: `teamtailor:${id}`,
      title: xmlTag(block, "title"),
      location: [...new Set(places)].join(", ") || null,
      department: null,
      url,
      postedOn: postedOn(xmlTag(block, "pubDate")),
    });
    if (listed) jobs.push(listed);
  }
  return { ok: true, jobs };
}

async function joinJobs(slug: string): Promise<BoardFetch> {
  const html = await readPublicText(`https://join.com/companies/${encodeURIComponent(slug)}`, {
    maxBytes: 2_000_000,
    accept: "text/html",
    timeoutMs: 12_000,
  });
  if (!html) return { ok: false };
  const script = html.match(
    /<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i,
  );
  if (!script) return { ok: false };
  let data: unknown;
  try {
    data = JSON.parse(script[1]) as unknown;
  } catch {
    return { ok: false };
  }
  const page = asRecord(asRecord(asRecord(data)?.props)?.pageProps);
  const items = asRecord(asRecord(page?.initialState)?.jobs)?.items;
  if (!Array.isArray(items)) return { ok: false };
  return { ok: true, jobs: items.flatMap((entry) => {
    const job = asRecord(entry);
    if (!job) return [];
    const idParam = asString(job.idParam);
    const city = asRecord(job.city);
    const place = [asString(city?.cityName), asString(city?.countryName)]
      .filter((part): part is string => Boolean(part))
      .join(", ");
    const category = asString(asRecord(job.category)?.name);
    const listed = listedJob({
      id: `join:${slug}:${asString(job.id) ?? idParam}`,
      title: asString(job.title),
      location:
        place || (asString(job.workplaceType) === "REMOTE" ? "Remote" : null),
      department: category && category.toLowerCase() !== "other" ? category : null,
      url: idParam ? `https://join.com/companies/${slug}/${idParam}` : null,
      postedOn: postedOn(job.createdAt),
    });
    return listed ? [listed] : [];
  }) };
}

function jsonLdJobs(html: string): ListedJob[] {
  const jobs: ListedJob[] = [];
  for (const match of html.matchAll(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    let data: unknown;
    try {
      data = JSON.parse(match[1]) as unknown;
    } catch {
      continue;
    }
    const postings: Record<string, unknown>[] = [];
    collectPostings(data, postings);
    for (const posting of postings) {
      const url = jobUrl(posting.url) ?? jobUrl(posting.sameAs);
      const listed = listedJob({
        id: `jsonld:${url}`,
        title: asString(posting.title),
        location: jsonLdLocation(posting.jobLocation),
        department: asString(asRecord(posting.hiringOrganization)?.department),
        url,
        postedOn: postedOn(posting.datePosted),
      });
      if (listed) jobs.push(listed);
    }
  }
  return jobs;
}

function collectPostings(node: unknown, out: Record<string, unknown>[]): void {
  if (Array.isArray(node)) {
    for (const entry of node) collectPostings(entry, out);
    return;
  }
  const record = asRecord(node);
  if (!record) return;
  const type = record["@type"];
  const types = Array.isArray(type) ? type : type ? [type] : [];
  if (types.includes("JobPosting")) out.push(record);
  if (record["@graph"]) collectPostings(record["@graph"], out);
}

function joinPlace(parts: (string | null)[]): string | null {
  const unique: string[] = [];
  for (const part of parts) {
    if (!part) continue;
    if (unique.some((item) => item.toLowerCase() === part.toLowerCase())) continue;
    unique.push(part);
  }
  return unique.join(", ") || null;
}

function jsonLdLocation(value: unknown): string | null {
  const places = Array.isArray(value) ? value : value ? [value] : [];
  const names = places
    .map((place) => {
      if (typeof place === "string") return asString(place);
      const record = asRecord(place);
      if (!record) return null;
      const address = record.address;
      if (typeof address === "string") return asString(address);
      const addr = asRecord(address);
      if (!addr) return asString(record.name);
      const country = addr.addressCountry;
      const countryName =
        asString(country) ?? asString(asRecord(country)?.name);
      return joinPlace([
        asString(addr.addressLocality),
        asString(addr.addressRegion),
        countryName,
      ]);
    })
    .filter((name): name is string => Boolean(name));
  return [...new Set(names)].join("; ") || null;
}

/** Greenhouse-shaped job objects inlined on a custom careers site. */
function embeddedGreenhouseJobs(html: string): ListedJob[] {
  if (!html.includes("gh_jid=")) return [];
  const text = unescapeSlashes(html);
  const jobs: ListedJob[] = [];
  for (const part of text.split('"absolute_url":').slice(1)) {
    const url = jobUrl(part.match(/^"(https:[^"]+)"/)?.[1]);
    const ghId = url?.match(/[?&]gh_jid=(\d+)/)?.[1];
    if (!url || !ghId) continue;
    const contentAt = part.indexOf('"content":');
    const head = part.slice(0, contentAt > 0 ? contentAt : 6000);
    const title = asString(unescapeJs(head.match(/"title":"((?:\\.|[^"\\])*)"/)?.[1]));
    const department = asString(
      unescapeJs(
        head.match(
          /"name":"Department for Careers Web Posting","value":"((?:\\.|[^"\\])*)"/,
        )?.[1] ??
          head.match(/"departments":\[\{"id":\d+,"name":"((?:\\.|[^"\\])*)"/)?.[1],
      ),
    );
    const location = asString(
      unescapeJs(head.match(/"location":\{"name":"((?:\\.|[^"\\])*)"/)?.[1]),
    );
    const listed = listedJob({
      id: `greenhouse-embed:${ghId}`,
      title,
      location,
      department,
      url,
      postedOn: postedOn(head.match(/"first_published":"([^"]+)"/)?.[1]),
    });
    if (listed) jobs.push(listed);
  }
  return jobs;
}

function unescapeJs(value: string | undefined): string | null {
  if (!value) return null;
  return value
    .replace(/\\u([0-9a-f]{4})/gi, (_, hex: string) =>
      String.fromCharCode(parseInt(hex, 16)),
    )
    .replace(/\\n/g, " ")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");
}

function decodeXml(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
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

function xmlTag(block: string, tag: string): string | null {
  const match = block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i"));
  if (!match) return null;
  return asString(decodeXml(match[1]));
}

function xmlTags(block: string, tag: string): string[] {
  return [...block.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "gi"))]
    .map((match) => asString(decodeXml(match[1])))
    .filter((value): value is string => Boolean(value));
}
