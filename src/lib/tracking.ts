import type { MindMapNode } from "@/types/mindmap";

/** Private tag. Membership in the job tracker, not a label on the shared graph. */
export const TRACKED_TAG = "tracked";

const STATUS_PREFIX = "track-status:";
const SINCE_PREFIX = "track-since:";
const ROLE_PREFIX = "track-role:";
const APPLIED_PREFIX = "track-applied:";
const UPDATED_PREFIX = "track-updated:";
const CLOSED_PREFIX = "track-closed:";
const DENIED_PREFIX = "track-denied:";
const ARCHIVED_TAG = "track-archived";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** Running applications with no update for this long are shown as follow-up. */
export const FOLLOW_UP_AFTER_MS = 21 * 24 * 60 * 60 * 1000;

export type TrackStatus = "todo" | "pool" | "running" | "followup" | "denied";

export type TrackState = {
  status: TrackStatus;
  /** When the application was last marked in progress. */
  runningSince?: string;
  archived: boolean;
  /** Role applied for: a job link or a short note such as "speculative". */
  role?: string;
  /** Calendar date the application was first marked in progress. YYYY-MM-DD. */
  appliedOn?: string;
  /** Earlier row-edit stamp. Kept so older talent-pool rows still have a close date. */
  updatedOn?: string;
  /** Calendar date the process moved to the talent pool or was denied. YYYY-MM-DD. */
  closedOn?: string;
  /** Calendar date the application was marked denied. YYYY-MM-DD. */
  deniedOn?: string;
};

export const TRACK_STATUSES: {
  value: TrackStatus;
  label: string;
  dot: string;
  chip: string;
}[] = [
  {
    value: "todo",
    label: "To apply",
    dot: "bg-blue-500",
    chip: "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200",
  },
  {
    value: "pool",
    label: "Talent pool",
    dot: "bg-purple-500",
    chip: "border-purple-200 bg-purple-50 text-purple-800 dark:border-purple-800 dark:bg-purple-950 dark:text-purple-200",
  },
  {
    value: "running",
    label: "In progress",
    dot: "bg-green-500",
    chip: "border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200",
  },
  {
    value: "followup",
    label: "Follow up",
    dot: "bg-yellow-400",
    chip: "border-yellow-200 bg-yellow-50 text-yellow-900 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-200",
  },
  {
    value: "denied",
    label: "Closed",
    dot: "bg-red-500",
    chip: "border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200",
  },
];

export function isTrackerTag(tag: string): boolean {
  return (
    tag === TRACKED_TAG ||
    tag === ARCHIVED_TAG ||
    tag.startsWith(STATUS_PREFIX) ||
    tag.startsWith(SINCE_PREFIX) ||
    tag.startsWith(ROLE_PREFIX) ||
    tag.startsWith(APPLIED_PREFIX) ||
    tag.startsWith(UPDATED_PREFIX) ||
    tag.startsWith(CLOSED_PREFIX) ||
    tag.startsWith(DENIED_PREFIX)
  );
}

export function isTracked(node: MindMapNode): boolean {
  return node.tags?.includes(TRACKED_TAG) ?? false;
}

export function visibleTags(tags: string[] | undefined): string[] {
  return (tags ?? []).filter((tag) => !isTrackerTag(tag));
}

export function trackerTags(tags: string[] | undefined): string[] {
  return (tags ?? []).filter(isTrackerTag);
}

function withTags(node: MindMapNode, tags: string[]): MindMapNode {
  if (tags.length === 0) {
    const { tags: _removed, ...rest } = node;
    return rest;
  }
  return { ...node, tags };
}

function replaceTrackerTags(node: MindMapNode, tracker: string[]): MindMapNode {
  return withTags(node, [...visibleTags(node.tags), ...tracker]);
}

function isTrackStatus(value: string): value is TrackStatus {
  return (
    value === "todo" ||
    value === "pool" ||
    value === "running" ||
    value === "followup" ||
    value === "denied"
  );
}

export function readTrackState(node: MindMapNode): TrackState | null {
  if (!isTracked(node)) return null;
  const tags = node.tags ?? [];
  const raw = tags
    .find((tag) => tag.startsWith(STATUS_PREFIX))
    ?.slice(STATUS_PREFIX.length);
  const status = raw && isTrackStatus(raw) ? raw : "todo";
  const runningSince = tags
    .find((tag) => tag.startsWith(SINCE_PREFIX))
    ?.slice(SINCE_PREFIX.length);
  const encodedRole = tags
    .find((tag) => tag.startsWith(ROLE_PREFIX))
    ?.slice(ROLE_PREFIX.length);
  let role: string | undefined;
  if (encodedRole) {
    try {
      role = decodeURIComponent(encodedRole);
    } catch {
      role = encodedRole;
    }
  }
  return {
    status,
    ...(status === "running" && runningSince ? { runningSince } : {}),
    archived: tags.includes(ARCHIVED_TAG),
    ...(role ? { role } : {}),
    ...readCalendarTag(tags, APPLIED_PREFIX, "appliedOn"),
    ...readCalendarTag(tags, UPDATED_PREFIX, "updatedOn"),
    ...readCalendarTag(tags, CLOSED_PREFIX, "closedOn"),
    ...readCalendarTag(tags, DENIED_PREFIX, "deniedOn"),
  };
}

function readCalendarTag(
  tags: string[],
  prefix: string,
  key: "appliedOn" | "updatedOn" | "closedOn" | "deniedOn",
): Partial<TrackState> {
  const value = tags.find((tag) => tag.startsWith(prefix))?.slice(prefix.length);
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return {};
  return { [key]: value };
}

/** Local calendar day, so evening edits do not land on the previous date. */
export function calendarDate(now = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/** Oct 23, 2026 */
export function formatTrackDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;
  const month = MONTHS[Number(match[2]) - 1];
  const day = Number(match[3]);
  if (!month || day < 1 || day > 31) return iso;
  return `${month} ${day}, ${match[1]}`;
}

export function writeTrackState(node: MindMapNode, state: TrackState): MindMapNode {
  const tags = [TRACKED_TAG, `${STATUS_PREFIX}${state.status}`];
  if (state.status === "running" && state.runningSince) {
    tags.push(`${SINCE_PREFIX}${state.runningSince}`);
  }
  if (state.role) tags.push(`${ROLE_PREFIX}${encodeURIComponent(state.role)}`);
  if (state.appliedOn) tags.push(`${APPLIED_PREFIX}${state.appliedOn}`);
  if (state.updatedOn) tags.push(`${UPDATED_PREFIX}${state.updatedOn}`);
  if (
    (state.status === "pool" || state.status === "denied") &&
    state.closedOn
  ) {
    tags.push(`${CLOSED_PREFIX}${state.closedOn}`);
  }
  if (state.status === "denied" && state.deniedOn) {
    tags.push(`${DENIED_PREFIX}${state.deniedOn}`);
  }
  if (state.archived) tags.push(ARCHIVED_TAG);
  return replaceTrackerTags(node, tags);
}

export function withTracked(node: MindMapNode, tracked: boolean): MindMapNode {
  if (!tracked) return replaceTrackerTags(node, []);
  return writeTrackState(
    node,
    readTrackState(node) ?? { status: "todo", archived: false },
  );
}

export function withTrackStatus(
  node: MindMapNode,
  status: TrackStatus,
  now = new Date(),
): MindMapNode {
  const current = readTrackState(node) ?? { status: "todo", archived: false };
  const next: TrackState = {
    ...current,
    status,
    archived: status === "denied" ? true : current.archived,
  };
  if (status === "running") next.runningSince = now.toISOString();
  else delete next.runningSince;
  const today = calendarDate(now);
  if ((status === "running" || status === "followup") && !current.appliedOn) {
    next.appliedOn = today;
  }
  if (status === "pool" || status === "denied") {
    next.closedOn =
      current.status === status
        ? (current.closedOn ??
          (status === "denied" ? current.deniedOn : undefined) ??
          current.updatedOn ??
          today)
        : today;
  } else {
    delete next.closedOn;
  }
  if (status === "denied") {
    next.deniedOn =
      current.status === "denied" ? (current.deniedOn ?? next.closedOn ?? today) : today;
  } else {
    delete next.deniedOn;
  }
  return writeTrackState(node, next);
}

/** Date a talent-pool or denied process closed. Open processes have none. */
export function trackClosedOn(state: TrackState): string | undefined {
  if (state.status !== "pool" && state.status !== "denied") return undefined;
  return (
    state.closedOn ??
    (state.status === "denied" ? state.deniedOn : undefined) ??
    state.updatedOn
  );
}

export function withArchived(node: MindMapNode, archived: boolean): MindMapNode {
  const current = readTrackState(node) ?? { status: "todo", archived: false };
  return writeTrackState(node, { ...current, archived });
}

export function withTrackRole(node: MindMapNode, role: string): MindMapNode {
  const current = readTrackState(node) ?? { status: "todo", archived: false };
  const trimmed = role.trim();
  const next: TrackState = { ...current };
  if (trimmed) next.role = trimmed;
  else delete next.role;
  return writeTrackState(node, next);
}

export function withTrackDate(
  node: MindMapNode,
  field: "appliedOn" | "closedOn",
  value: string,
): MindMapNode {
  const current = readTrackState(node) ?? { status: "todo", archived: false };
  const next: TrackState = { ...current };
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(value);
  if (field === "appliedOn") {
    if (valid) next.appliedOn = value;
    else delete next.appliedOn;
  } else if (valid) {
    next.closedOn = value;
    if (next.status === "denied") next.deniedOn = value;
  } else {
    delete next.closedOn;
    if (next.status === "denied") delete next.deniedOn;
  }
  return writeTrackState(node, next);
}

/** Running applications past three weeks are shown as follow-up. */
export function shownTrackStatus(
  state: TrackState,
  now = Date.now(),
): TrackStatus {
  if (state.status !== "running" || !state.runningSince) return state.status;
  const started = Date.parse(state.runningSince);
  if (Number.isNaN(started)) return state.status;
  if (now - started >= FOLLOW_UP_AFTER_MS) return "followup";
  return "running";
}

export type ActivityGrain = "day" | "week";

/** Running totals through the end of one day or week. */
export type ActivityPoint = {
  /** Day, or Monday of the week. YYYY-MM-DD. */
  start: string;
  /** Inclusive date the totals run through. */
  through: string;
  /** Applications sent on or before `through`. */
  sent: number;
  /** Of those, how many were denied on or before `through`. */
  denied: number;
};

type ActivityEvent = {
  sentOn: string;
  deniedOn?: string;
};

function parseIsoDate(iso: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (
    date.getFullYear() !== Number(match[1]) ||
    date.getMonth() !== Number(match[2]) - 1 ||
    date.getDate() !== Number(match[3])
  ) {
    return null;
  }
  return date;
}

function addIsoDays(iso: string, days: number): string {
  const date = parseIsoDate(iso);
  if (!date) return iso;
  date.setDate(date.getDate() + days);
  return calendarDate(date);
}

function startOfWeek(iso: string): string {
  const date = parseIsoDate(iso);
  if (!date) return iso;
  const mondayOffset = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - mondayOffset);
  return calendarDate(date);
}

function isoStamp(value: string | undefined): string | undefined {
  if (!value || !parseIsoDate(value)) return undefined;
  return value;
}

function activityEvent(state: TrackState): ActivityEvent | null {
  const sentOn = isoStamp(state.appliedOn);
  if (!sentOn) return null;
  const deniedOn = state.status === "denied"
    ? isoStamp(state.deniedOn ?? state.closedOn ?? state.appliedOn)
    : undefined;
  if (!deniedOn) return { sentOn };
  return { sentOn, deniedOn: deniedOn < sentOn ? sentOn : deniedOn };
}

function totalsThrough(
  events: ActivityEvent[],
  through: string,
): { sent: number; denied: number } {
  let sent = 0;
  let denied = 0;
  for (const event of events) {
    if (event.sentOn > through) continue;
    sent += 1;
    if (event.deniedOn && event.deniedOn <= through) denied += 1;
  }
  return { sent, denied };
}

/**
 * Cumulative applications sent, with denials dated separately.
 * Day points cover every calendar day from the first application through today.
 * Week points are the same totals at the end of each Monday–Sunday week.
 */
export function applicationActivity(
  nodes: MindMapNode[],
  grain: ActivityGrain,
  now = new Date(),
): ActivityPoint[] {
  const events: ActivityEvent[] = [];
  for (const node of nodes) {
    if (node.type !== "organization") continue;
    const state = readTrackState(node);
    if (!state) continue;
    const event = activityEvent(state);
    if (event) events.push(event);
  }
  if (events.length === 0) return [];

  let rangeStart = events[0].sentOn;
  let rangeEnd = calendarDate(now);
  for (const event of events) {
    if (event.sentOn < rangeStart) rangeStart = event.sentOn;
    if (event.sentOn > rangeEnd) rangeEnd = event.sentOn;
    if (event.deniedOn && event.deniedOn > rangeEnd) rangeEnd = event.deniedOn;
  }

  if (grain === "week") {
    const points: ActivityPoint[] = [];
    const cursor = parseIsoDate(startOfWeek(rangeStart));
    const lastWeek = startOfWeek(rangeEnd);
    if (!cursor) return [];
    for (let guard = 0; guard < 400; guard += 1) {
      const start = calendarDate(cursor);
      const sunday = addIsoDays(start, 6);
      const through = sunday < rangeEnd ? sunday : rangeEnd;
      points.push({ start, through, ...totalsThrough(events, through) });
      if (start >= lastWeek) break;
      cursor.setDate(cursor.getDate() + 7);
    }
    return points;
  }

  const points: ActivityPoint[] = [];
  const cursor = parseIsoDate(rangeStart);
  if (!cursor) return [];
  for (let guard = 0; guard < 2000; guard += 1) {
    const day = calendarDate(cursor);
    points.push({ start: day, through: day, ...totalsThrough(events, day) });
    if (day >= rangeEnd) break;
    cursor.setDate(cursor.getDate() + 1);
  }
  return points;
}
