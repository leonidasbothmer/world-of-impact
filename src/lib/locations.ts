/** Offices or work locations. "remote" is stored as "Remote", like any other chip. */
export function normalizeLocation(raw: string): string {
  const value = raw.trim().replace(/,+$/, "");
  if (!value) return "";
  if (value.toLowerCase() === "remote") return "Remote";
  return value;
}

/** Unique locations already on the map, most-used first. */
export function collectLocations(nodes: { locations?: string[] }[]): string[] {
  const counts = new Map<string, { label: string; count: number }>();
  for (const node of nodes) {
    for (const raw of node.locations ?? []) {
      const label = normalizeLocation(raw);
      if (!label) continue;
      const key = label.toLowerCase();
      const bucket = counts.get(key);
      if (!bucket) {
        counts.set(key, { label, count: 1 });
        continue;
      }
      bucket.count += 1;
      if (
        bucket.label === bucket.label.toLowerCase() &&
        label !== label.toLowerCase()
      ) {
        bucket.label = label;
      }
    }
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .map((item) => item.label);
}

/** Existing locations matching `query`, excluding ones already chosen. */
export function matchLocations(
  catalog: string[],
  query: string,
  taken: string[],
): string[] {
  const needle = query.trim().toLowerCase().replace(/,+$/, "");
  if (!needle) return [];
  const takenSet = new Set(taken.map((item) => item.toLowerCase()));
  const starts: string[] = [];
  const includes: string[] = [];
  for (const label of catalog) {
    const key = label.toLowerCase();
    if (takenSet.has(key)) continue;
    if (key === needle && label === query.trim()) continue;
    if (key.startsWith(needle)) starts.push(label);
    else if (key.includes(needle)) includes.push(label);
  }
  return [...starts, ...includes].slice(0, 6);
}

/** Returns the next list when `raw` is a new location, otherwise null. */
export function appendLocation(
  locations: string[] | undefined,
  raw: string,
): string[] | null {
  const value = normalizeLocation(raw);
  if (!value) return null;
  const current = locations ?? [];
  if (current.some((item) => item.toLowerCase() === value.toLowerCase())) {
    return null;
  }
  return [...current, value];
}
