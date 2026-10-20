"use client";

import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import {
  applicationActivity,
  formatTrackDate,
  formatTrackDateRange,
  type ActivityGrain,
  type ActivityPoint,
} from "@/lib/tracking";
import { cn } from "@/lib/utils";
import type { MindMapNode } from "@/types/mindmap";

const PLOT_HEIGHT = 232;
const PAD_TOP = 14;
const PAD_BOTTOM = 32;
const PLOT_INNER = PLOT_HEIGHT - PAD_TOP - PAD_BOTTOM;

type ActivityMode = "cumulative" | "new";

/** Inclusive calendar days, YYYY-MM-DD. */
export type ActivityDateRange = {
  from: string;
  to: string;
};

type ActivityCounts = {
  sent: number;
  pool: number;
  denied: number;
  open: number;
};

/** Counts drawn for one bar. New mode is the change since the previous bar. */
function valuesAt(
  points: ActivityPoint[],
  index: number,
  mode: ActivityMode,
): ActivityCounts {
  const point = points[index];
  if (!point) return { sent: 0, pool: 0, denied: 0, open: 0 };
  if (mode === "cumulative") {
    return { sent: point.sent, pool: point.pool, denied: point.denied, open: point.open };
  }
  const previous = index > 0 ? points[index - 1] : undefined;
  return {
    sent: point.sent - (previous?.sent ?? 0),
    pool: point.pool - (previous?.pool ?? 0),
    denied: point.denied - (previous?.denied ?? 0),
    open: point.open - (previous?.open ?? 0),
  };
}

export function ApplicationChartSection({
  nodes,
  dateRange,
  onDateRange,
}: {
  nodes: MindMapNode[];
  dateRange: ActivityDateRange | null;
  onDateRange: (range: ActivityDateRange) => void;
}) {
  const [open, setOpen] = useState(false);
  const summary = useMemo(() => applicationActivity(nodes, "day").at(-1), [nodes]);

  return (
    <section className="min-w-0 shrink-0 border-t bg-background">
      <button
        type="button"
        className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-xs font-medium hover:bg-muted/50"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <ChevronRight
          className={cn(
            "size-3.5 text-muted-foreground transition-transform",
            open && "rotate-90",
          )}
        />
        Applications
        {summary ? (
          <>
            <span className="font-normal text-green-700 dark:text-green-400">
              {summary.sent} sent
            </span>
            <span className="font-normal text-purple-700 dark:text-purple-400">
              {summary.pool} talent pool
            </span>
            <span className="font-normal text-red-700 dark:text-red-400">
              {summary.denied} denied
            </span>
          </>
        ) : (
          <span className="font-normal text-muted-foreground">No applied dates yet</span>
        )}
      </button>
      <div
        className={cn(
          "grid min-w-0 transition-[grid-template-rows] duration-200 ease-out",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="min-w-0 overflow-hidden" inert={!open}>
          <div className="min-w-0 border-t py-3">
            <ApplicationChart
              nodes={nodes}
              visible={open}
              dateRange={dateRange}
              onDateRange={onDateRange}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function ApplicationChart({
  nodes,
  visible,
  dateRange,
  onDateRange,
}: {
  nodes: MindMapNode[];
  visible: boolean;
  dateRange: ActivityDateRange | null;
  onDateRange: (range: ActivityDateRange) => void;
}) {
  const [grain, setGrain] = useState<ActivityGrain>("day");
  const [mode, setMode] = useState<ActivityMode>("new");
  const [showSent, setShowSent] = useState(true);
  const [showPool, setShowPool] = useState(true);
  const [showDenied, setShowDenied] = useState(true);
  const [active, setActive] = useState<number | null>(null);
  const points = useMemo(
    () => applicationActivity(nodes, grain),
    [nodes, grain],
  );
  const latest = points.at(-1);
  const hovering = active != null && active >= 0 && active < points.length;
  const rangeSpan = useMemo(
    () => overlappingSpan(points, dateRange),
    [points, dateRange],
  );
  const readout = hovering
    ? active
    : rangeSpan
      ? rangeSpan.end
      : Math.max(0, points.length - 1);
  const point = points[readout];
  const rangeTotals =
    !hovering && rangeSpan ? sumNew(points, rangeSpan.start, rangeSpan.end) : null;
  const shown =
    rangeTotals && rangeSpan
      ? mode === "new"
        ? rangeTotals
        : valuesAt(points, rangeSpan.end, "cumulative")
      : valuesAt(points, readout, mode);
  const added = rangeTotals ?? valuesAt(points, readout, "new");
  const readoutLabel =
    !hovering && dateRange && rangeSpan
      ? formatTrackDateRange(dateRange.from, dateRange.to)
      : point
        ? grain === "week"
          ? `Week of ${formatTrackDate(point.start)}`
          : formatTrackDate(point.through)
        : "";

  return (
    <div className="flex min-w-0 flex-col gap-3 px-4">
      <div className="flex flex-wrap items-center gap-2">
        <div
          className="inline-flex rounded-lg border bg-muted/40 p-0.5"
          role="tablist"
          aria-label="Chart interval"
        >
          {(
            [
              ["day", "Day"],
              ["week", "Week"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={grain === value}
              className={cn(
                "rounded-md px-2 py-0.5 text-xs font-medium",
                grain === value
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground",
              )}
              onClick={() => {
                setGrain(value);
                setActive(null);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div
          className="inline-flex rounded-lg border bg-muted/40 p-0.5"
          role="tablist"
          aria-label="Bar height"
        >
          {(
            [
              ["cumulative", "Cumulative"],
              ["new", "New"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={mode === value}
              className={cn(
                "rounded-md px-2 py-0.5 text-xs font-medium",
                mode === value
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground",
              )}
              onClick={() => setMode(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 sm:ml-auto">
          <LegendButton
            label="Sent"
            count={latest?.sent}
            pressed={showSent}
            swatch="bg-green-500"
            onClick={() => setShowSent((current) => !current)}
          />
          <LegendButton
            label="Talent pool"
            count={latest?.pool}
            pressed={showPool}
            swatch="bg-purple-500"
            onClick={() => setShowPool((current) => !current)}
          />
          <LegendButton
            label="Denied"
            count={latest?.denied}
            pressed={showDenied}
            swatch="bg-red-500"
            onClick={() => setShowDenied((current) => !current)}
          />
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        {mode === "cumulative"
          ? grain === "day"
            ? "Each bar is the running total through that day."
            : "Each bar is the running total through the end of that week."
          : grain === "day"
            ? "Each bar is only what was new that day. Sent, talent pool, and denied stack."
            : "Each bar is only what was new that week. Sent, talent pool, and denied stack."}
        {outcomeCaption(mode, showSent, showPool, showDenied)}
        {" "}
        Click or drag to filter the list to those days.
      </p>

      {points.length === 0 ? (
        <div className="flex h-[232px] items-center justify-center text-center text-xs text-muted-foreground">
          Applications show up here once they are sent or moved to the talent pool.
        </div>
      ) : !showSent && !showPool && !showDenied ? (
        <div className="flex h-[232px] items-center justify-center text-center text-xs text-muted-foreground">
          Turn Sent, Talent pool, or Denied back on to see the chart.
        </div>
      ) : (
        <>
          <p className="flex h-5 flex-wrap items-baseline gap-x-3 text-xs" aria-live="polite">
            <span className="font-medium text-foreground">{readoutLabel}</span>
            {showSent ? (
              <span className="text-green-700 dark:text-green-400">
                {shown.sent} sent
                {mode === "cumulative" ? <Gain value={added.sent} /> : null}
              </span>
            ) : null}
            {showPool ? (
              <span className="text-purple-700 dark:text-purple-400">
                {shown.pool} talent pool
                {mode === "cumulative" ? <Gain value={added.pool} /> : null}
              </span>
            ) : null}
            {showDenied ? (
              <span className="text-red-700 dark:text-red-400">
                {shown.denied} denied
                {mode === "cumulative" ? <Gain value={added.denied} /> : null}
              </span>
            ) : null}
          </p>
          <ActivityPlot
            points={points}
            grain={grain}
            mode={mode}
            showSent={showSent}
            showPool={showPool}
            showDenied={showDenied}
            selected={readout}
            hoverIndex={hovering ? active : null}
            rangeSpan={rangeSpan}
            visible={visible}
            onSelect={(index) => {
              setActive((current) => (current === index ? current : index));
            }}
            onRange={(start, end) => {
              const fromIndex = Math.min(start, end);
              const toIndex = Math.max(start, end);
              const from = points[fromIndex]?.start;
              const to = points[toIndex]?.through;
              if (!from || !to) return;
              onDateRange(from <= to ? { from, to } : { from: to, to: from });
            }}
          />
        </>
      )}
    </div>
  );
}

function LegendButton({
  label,
  count,
  pressed,
  swatch,
  onClick,
}: {
  label: string;
  count?: number;
  pressed: boolean;
  swatch: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      title={pressed ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs font-medium hover:bg-muted",
        !pressed && "text-muted-foreground line-through opacity-40",
      )}
      onClick={onClick}
    >
      <span className={cn("size-2.5 rounded-[3px]", pressed ? swatch : "bg-muted-foreground/40")} />
      {label}
      {count != null ? <span className="tabular-nums text-muted-foreground">{count}</span> : null}
    </button>
  );
}

function Gain({ value }: { value: number }) {
  if (value <= 0) return null;
  return <span className="text-muted-foreground"> (+{value})</span>;
}

function sumNew(
  points: ActivityPoint[],
  start: number,
  end: number,
): ActivityCounts {
  let sent = 0;
  let pool = 0;
  let denied = 0;
  let open = 0;
  for (let index = start; index <= end; index += 1) {
    const added = valuesAt(points, index, "new");
    sent += added.sent;
    pool += added.pool;
    denied += added.denied;
    open += added.open;
  }
  return { sent, pool, denied, open };
}

function outcomeCaption(
  mode: ActivityMode,
  showSent: boolean,
  showPool: boolean,
  showDenied: boolean,
): string {
  if (mode !== "cumulative" || !showSent) return "";
  if (showPool && showDenied) {
    return " Purple is the share in the talent pool, and red is the share that has been denied.";
  }
  if (showPool) return " Purple is the share in the talent pool.";
  if (showDenied) return " Red is the share that has been denied.";
  return "";
}

/** Bars whose day or week overlaps the inclusive filter. */
function overlappingSpan(
  points: ActivityPoint[],
  range: ActivityDateRange | null,
): { start: number; end: number } | null {
  if (!range || points.length === 0) return null;
  const from = range.from <= range.to ? range.from : range.to;
  const to = range.from <= range.to ? range.to : range.from;
  let start = -1;
  let end = -1;
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    if (point.through < from || point.start > to) continue;
    if (start === -1) start = index;
    end = index;
  }
  if (start === -1) return null;
  return { start, end };
}

function axisScale(maxValue: number): { max: number; ticks: number[] } {
  const value = Math.max(1, maxValue);
  const raw = value <= 4 ? 1 : value / 4;
  const exponent = 10 ** Math.floor(Math.log10(raw));
  const fraction = raw / exponent;
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  const step = value <= 4 ? 1 : nice * exponent;
  const max = Math.ceil(value / step) * step;
  const ticks: number[] = [];
  for (let tick = 0; tick <= max + step / 100; tick += step) ticks.push(Math.round(tick));
  return { max, ticks };
}

function shortDate(iso: string): string {
  return formatTrackDate(iso).replace(/, \d{4}$/, "");
}

function ActivityPlot({
  points,
  grain,
  mode,
  showSent,
  showPool,
  showDenied,
  selected,
  hoverIndex,
  rangeSpan,
  visible,
  onSelect,
  onRange,
}: {
  points: ActivityPoint[];
  grain: ActivityGrain;
  mode: ActivityMode;
  showSent: boolean;
  showPool: boolean;
  showDenied: boolean;
  selected: number;
  hoverIndex: number | null;
  rangeSpan: { start: number; end: number } | null;
  visible: boolean;
  onSelect: (index: number | null) => void;
  onRange: (start: number, end: number) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ anchor: number; pointerId: number } | null>(null);
  const clipPrefix = useId().replace(/:/g, "");
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    const update = () => setWidth(node.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const scrollKey = `${grain}:${points.length}:${visible}`;
  useLayoutEffect(() => {
    const node = scrollRef.current;
    if (!node || !visible || width === 0) return;
    // The plot is mounted while the section is collapsed, so the first
    // scroll lands before the row has height and does not stick.
    const pin = () => {
      node.scrollLeft = node.scrollWidth;
    };
    pin();
    const frame = requestAnimationFrame(pin);
    const timer = window.setTimeout(pin, 250);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [scrollKey, width, visible]);

  const bars = points.map((point, index) => {
    const values = valuesAt(points, index, mode);
    const heights = barHeights(values, mode, showSent, showPool, showDenied);
    return { ...point, ...heights, total: heights.sentHeight + heights.poolHeight + heights.deniedHeight };
  });
  const { max: axisMax, ticks } = axisScale(Math.max(...bars.map((bar) => bar.total), 0));
  const axisWidth = axisMax >= 100 ? 40 : 32;
  const minSlot = grain === "day" ? 14 : 36;
  const plotWidth = Math.max(width, points.length * minSlot);
  const slot = points.length > 0 ? plotWidth / points.length : plotWidth;
  const labelEvery = Math.max(1, Math.ceil(42 / slot));
  const labelIndexes: number[] = [];
  for (let index = 0; index < points.length; index += 1) {
    if (index % labelEvery === 0) labelIndexes.push(index);
  }
  const lastIndex = points.length - 1;
  if (lastIndex > 0 && labelIndexes.at(-1) !== lastIndex) {
    const previous = labelIndexes.at(-1) ?? 0;
    if (lastIndex - previous >= labelEvery * 0.6) labelIndexes.push(lastIndex);
  }

  function y(value: number) {
    return PAD_TOP + ((axisMax - value) / axisMax) * PLOT_INNER;
  }

  function indexFromClientX(clientX: number): number | null {
    const node = scrollRef.current?.querySelector("svg");
    if (!node || points.length === 0) return null;
    const rect = node.getBoundingClientRect();
    if (rect.width <= 0) return null;
    const index = Math.floor(((clientX - rect.left) / rect.width) * points.length);
    return Math.min(points.length - 1, Math.max(0, index));
  }

  function move(next: number) {
    const index = Math.min(points.length - 1, Math.max(0, next));
    onSelect(index);
    const node = scrollRef.current;
    if (!node) return;
    const left = index * slot;
    const viewLeft = node.scrollLeft;
    const viewRight = viewLeft + node.clientWidth;
    if (left < viewLeft || left + slot > viewRight) {
      node.scrollLeft = left - node.clientWidth / 2 + slot / 2;
    }
  }

  return (
    <div className="flex min-w-0">
      <svg
        width={axisWidth}
        height={PLOT_HEIGHT}
        className="shrink-0 text-[10px] text-muted-foreground"
        aria-hidden
      >
        {ticks.map((tick) => (
          <text
            key={tick}
            x={axisWidth - 8}
            y={y(tick)}
            textAnchor="end"
            dominantBaseline="middle"
            className="fill-current"
          >
            {tick}
          </text>
        ))}
      </svg>
      <div
        ref={scrollRef}
        tabIndex={0}
        className="min-w-0 flex-1 touch-pan-y overflow-x-auto outline-none select-none focus-visible:ring-2 focus-visible:ring-ring/50"
        aria-label={
          grain === "day"
            ? "Applications by day. Click or drag to filter those days. Arrow keys move between days."
            : "Applications by week. Click or drag to filter those weeks. Arrow keys move between weeks."
        }
        onKeyDown={(event) => {
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
          event.preventDefault();
          move(selected + (event.key === "ArrowRight" ? 1 : -1));
        }}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          const index = indexFromClientX(event.clientX);
          if (index == null) return;
          dragRef.current = { anchor: index, pointerId: event.pointerId };
          try {
            event.currentTarget.setPointerCapture(event.pointerId);
          } catch {
            // Capture fails if the pointer is already gone. The drag still tracks moves.
          }
          onSelect(index);
          onRange(index, index);
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current;
          if (drag && drag.pointerId === event.pointerId) {
            const index = indexFromClientX(event.clientX);
            if (index == null) return;
            onRange(drag.anchor, index);
            onSelect(index === drag.anchor ? index : null);
            return;
          }
          if (event.pointerType !== "mouse" || event.buttons !== 0) return;
          const index = indexFromClientX(event.clientX);
          if (index == null) return;
          onSelect(index);
        }}
        onPointerUp={(event) => {
          if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
        }}
        onPointerCancel={(event) => {
          if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
        }}
      >
        {width > 0 ? (
          <svg
            width={plotWidth}
            height={PLOT_HEIGHT}
            className="cursor-pointer text-[10px] text-muted-foreground"
            role="img"
            aria-label={describePoint(points[selected], grain, valuesAt(points, selected, mode))}
          >
            {ticks.map((tick) => (
              <line
                key={tick}
                x1={0}
                x2={plotWidth}
                y1={y(tick)}
                y2={y(tick)}
                className="stroke-border"
                strokeWidth={1}
              />
            ))}
            {rangeSpan ? (
              <rect
                x={rangeSpan.start * slot}
                y={PAD_TOP}
                width={(rangeSpan.end - rangeSpan.start + 1) * slot}
                height={PLOT_INNER}
                className="fill-foreground/5"
              />
            ) : null}
            {hoverIndex != null ? (
              <rect
                x={hoverIndex * slot}
                y={PAD_TOP}
                width={slot}
                height={PLOT_INNER}
                className="fill-foreground/10"
              />
            ) : !rangeSpan ? (
              <rect
                x={selected * slot}
                y={PAD_TOP}
                width={slot}
                height={PLOT_INNER}
                className="fill-foreground/5"
              />
            ) : null}
            <defs>
              {bars.map((bar, index) => {
                if (bar.total <= 0) return null;
                const barWidth = Math.min(48, Math.max(3, slot * 0.72));
                const x = index * slot + (slot - barWidth) / 2;
                const top = y(bar.total);
                const height = y(0) - top;
                return (
                  <clipPath id={`${clipPrefix}-${index}`} key={bar.start}>
                    <path d={topRoundedRect(x, top, barWidth, height, 3)} />
                  </clipPath>
                );
              })}
            </defs>
            {bars.map((bar, index) => {
              if (bar.total <= 0) return null;
              const barWidth = Math.min(48, Math.max(3, slot * 0.72));
              const x = index * slot + (slot - barWidth) / 2;
              const bottom = y(0);
              const sentTop = y(bar.sentHeight);
              const poolTop = y(bar.sentHeight + bar.poolHeight);
              return (
                <g key={bar.start} clipPath={`url(#${clipPrefix}-${index})`}>
                  {bar.sentHeight > 0 ? (
                    <rect
                      x={x}
                      y={sentTop}
                      width={barWidth}
                      height={bottom - sentTop}
                      className="fill-green-500"
                    />
                  ) : null}
                  {bar.poolHeight > 0 ? (
                    <rect
                      x={x}
                      y={poolTop}
                      width={barWidth}
                      height={sentTop - poolTop}
                      className="fill-purple-500"
                    />
                  ) : null}
                  {bar.deniedHeight > 0 ? (
                    <rect
                      x={x}
                      y={y(bar.total)}
                      width={barWidth}
                      height={poolTop - y(bar.total)}
                      className="fill-red-500"
                    />
                  ) : null}
                </g>
              );
            })}
            {labelIndexes.map((index) => {
              const current = points[index];
              const center = index * slot + slot / 2;
              const anchor = index === 0 ? "start" : index === lastIndex ? "end" : "middle";
              const labelX =
                index === 0
                  ? Math.max(0, center - 18)
                  : index === lastIndex
                    ? Math.min(plotWidth, center + 18)
                    : center;
              return (
                <text
                  key={current.start}
                  x={labelX}
                  y={PAD_TOP + PLOT_INNER + 18}
                  textAnchor={anchor}
                  className="fill-current"
                >
                  {shortDate(current.start)}
                </text>
              );
            })}
          </svg>
        ) : (
          <div style={{ height: PLOT_HEIGHT }} />
        )}
      </div>
    </div>
  );
}

/** Rectangle with a rounded top and a square base, for clipping a stacked bar. */
function topRoundedRect(
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): string {
  const r = Math.min(radius, width / 2, Math.max(0, height / 2));
  if (r <= 0) return `M${x},${y} h${width} v${height} h${-width} Z`;
  return [
    `M${x},${y + height}`,
    `V${y + r}`,
    `Q${x},${y} ${x + r},${y}`,
    `H${x + width - r}`,
    `Q${x + width},${y} ${x + width},${y + r}`,
    `V${y + height}`,
    "Z",
  ].join(" ");
}

function barHeights(
  values: ActivityCounts,
  mode: ActivityMode,
  showSent: boolean,
  showPool: boolean,
  showDenied: boolean,
): { sentHeight: number; poolHeight: number; deniedHeight: number } {
  const poolHeight = showPool ? Math.max(0, values.pool) : 0;
  const deniedHeight = showDenied ? Math.max(0, values.denied) : 0;
  if (!showSent) return { sentHeight: 0, poolHeight, deniedHeight };
  if (mode === "new") {
    return { sentHeight: Math.max(0, values.sent), poolHeight, deniedHeight };
  }
  const sentHeight =
    showPool && showDenied
      ? values.open
      : showPool
        ? values.open + values.denied
        : showDenied
          ? values.sent - values.denied
          : values.sent;
  return { sentHeight: Math.max(0, sentHeight), poolHeight, deniedHeight };
}

function describePoint(
  point: ActivityPoint | undefined,
  grain: ActivityGrain,
  values: ActivityCounts,
): string {
  if (!point) return "Application chart";
  const when =
    grain === "week"
      ? `Week of ${formatTrackDate(point.start)}`
      : formatTrackDate(point.through);
  return `${when}. ${values.sent} applications sent, ${values.pool} in the talent pool, ${values.denied} denied.`;
}
