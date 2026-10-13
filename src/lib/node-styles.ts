import type { NodeType } from "@/types/mindmap";

/** Person moons are a fixed circle. The name is hover-only and not part of the box. */
export const PERSON_NODE_SIZE = 24;

export const NODE_TYPE_CONFIG: Record<
  NodeType,
  { label: string; bg: string; border: string; text: string; dot: string }
> = {
  problem: {
    label: "Problem",
    bg: "bg-rose-50 dark:bg-rose-950/40",
    border: "border-rose-300 dark:border-rose-700",
    text: "text-rose-900 dark:text-rose-100",
    dot: "bg-rose-500",
  },
  solution: {
    label: "Solution",
    bg: "bg-emerald-50 dark:bg-emerald-950/40",
    border: "border-emerald-300 dark:border-emerald-700",
    text: "text-emerald-900 dark:text-emerald-100",
    dot: "bg-emerald-500",
  },
  organization: {
    label: "Organization",
    bg: "bg-sky-50 dark:bg-sky-950/40",
    border: "border-sky-300 dark:border-sky-700",
    text: "text-sky-900 dark:text-sky-100",
    dot: "bg-sky-500",
  },
  person: {
    label: "Person",
    bg: "bg-violet-50 dark:bg-violet-950/40",
    border: "border-violet-300 dark:border-violet-700",
    text: "text-violet-900 dark:text-violet-100",
    dot: "bg-violet-500",
  },
  academic: {
    label: "Academic",
    bg: "bg-amber-50 dark:bg-amber-950/40",
    border: "border-amber-300 dark:border-amber-700",
    text: "text-amber-900 dark:text-amber-100",
    dot: "bg-amber-500",
  },
  media: {
    label: "Media",
    bg: "bg-fuchsia-50 dark:bg-fuchsia-950/40",
    border: "border-fuchsia-300 dark:border-fuchsia-700",
    text: "text-fuchsia-900 dark:text-fuchsia-100",
    dot: "bg-fuchsia-500",
  },
};
