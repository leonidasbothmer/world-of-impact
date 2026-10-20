const FILTERS_KEY = "impact-jobs-filters";

const ROLE_REST =
  /^(?:manager|management|designer|design|owner|lead|er|or|in|product|produkt)?$/;

/** English and German spellings of the same role word. */
const ALIASES: Record<string, string[]> = {
  product: ["product", "produkt"],
  produkt: ["product", "produkt"],
};

export function loadJobFilters(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(FILTERS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  } catch {
    return [];
  }
}

export function saveJobFilters(tags: string[]) {
  window.localStorage.setItem(FILTERS_KEY, JSON.stringify(tags));
}

export function normalizeJobTag(value: string): string | null {
  const clean = value.trim().replace(/\s+/g, " ");
  if (clean.length < 2 || clean.length > 60) return null;
  return clean;
}

function stem(word: string): string {
  let value = word.toLowerCase();
  if (value.length > 4 && value.endsWith("s") && !value.endsWith("ss")) {
    value = value.slice(0, -1);
  }
  return value.replace(/(?:ement|ment|ers|er|ors|or|ings|ing)$/i, "");
}

function forms(word: string): string[] {
  const base = word.toLowerCase();
  const mapped = ALIASES[base] ?? [base];
  return [...new Set(mapped.flatMap((item) => [item, stem(item)]))];
}

function words(value: string): string[] {
  return value.toLowerCase().split(/[^a-z0-9+#]+/).filter(Boolean);
}

function wordHits(tagWord: string, fieldWord: string): boolean {
  const tagForms = forms(tagWord);
  const fieldForms = forms(fieldWord);
  for (const tag of tagForms) {
    for (const field of fieldForms) {
      if (tag === field) return true;
      if (tag.length >= 4 && field.length >= 4) {
        const [short, long] = tag.length <= field.length ? [tag, field] : [field, tag];
        if (long.startsWith(short) && long.length - short.length <= 1) return true;
      }
    }
  }
  const raw = fieldWord.toLowerCase();
  for (const tag of tagForms) {
    if (tag.length < 4) continue;
    if (!raw.startsWith(tag) && !raw.endsWith(tag)) continue;
    const rest = raw.startsWith(tag) ? raw.slice(tag.length) : raw.slice(0, -tag.length);
    if (ROLE_REST.test(rest)) return true;
  }
  return false;
}

/** A tag matches when every word hits the title or department. "product" is broader than "product design". */
export function jobMatchesTag(
  title: string,
  department: string | null,
  tag: string,
): boolean {
  const tagNorm = tag.trim().toLowerCase();
  if (!tagNorm) return false;
  const hay = `${title} ${department ?? ""}`.toLowerCase();
  const tagWords = words(tagNorm);
  if (tagWords.length === 0) return false;
  if (tagWords.length > 1 && hay.includes(tagNorm)) return true;
  const fieldWords = words(hay);
  return tagWords.every((tagWord) =>
    fieldWords.some((fieldWord) => wordHits(tagWord, fieldWord)),
  );
}

export function jobMatchesFilters(
  title: string,
  department: string | null,
  tags: string[],
): boolean {
  if (tags.length === 0) return true;
  return tags.some((tag) => jobMatchesTag(title, department, tag));
}
