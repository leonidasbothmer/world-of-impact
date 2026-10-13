"use client";

import { createContext, useContext, useRef, useState } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  useViewport,
  type EdgeProps,
} from "@xyflow/react";
import { Input } from "@/components/ui/input";

type EdgeLabelApi = {
  editingId: string | null;
  commit: (id: string, label: string) => void;
  cancel: () => void;
  select: (id: string) => void;
};

export const EdgeLabelContext = createContext<EdgeLabelApi | null>(null);

function labelPosition(labelX: number, labelY: number, zoom: number): React.CSSProperties {
  const safeZoom = zoom > 0 ? zoom : 1;
  return {
    transform: `translate(${labelX}px, ${labelY}px) translate(-50%, -50%) scale(${1 / safeZoom})`,
    transformOrigin: "center",
  };
}

function labelText(label: EdgeProps["label"]) {
  return typeof label === "string" ? label : "";
}

/**
 * Quadratic arc that bows away from the origin. The layout is gathered
 * there, so longer links skirt the dense middle instead of cutting through
 * it. Short links barely bend. A stable per-edge scale keeps two similar
 * chords from lying on top of each other.
 */
function arcEdge(id: string, sourceX: number, sourceY: number, targetX: number, targetY: number) {
  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
  const length = Math.hypot(dx, dy);
  const midX = (sourceX + targetX) / 2;
  const midY = (sourceY + targetY) / 2;
  if (length < 1) {
    return { path: `M ${sourceX},${sourceY} L ${targetX},${targetY}`, labelX: midX, labelY: midY };
  }

  let nx = -dy / length;
  let ny = dx / length;
  const outward = midX * nx + midY * ny;
  if (outward < 0) {
    nx = -nx;
    ny = -ny;
  }
  if (Math.abs(outward) < 8 && hashSign(id) < 0) {
    nx = -nx;
    ny = -ny;
  }

  const bend = Math.min(150, length * 0.2) * hashScale(id);
  const controlX = midX + nx * bend;
  const controlY = midY + ny * bend;
  return {
    path: `M ${sourceX},${sourceY} Q ${controlX},${controlY} ${targetX},${targetY}`,
    labelX: 0.25 * sourceX + 0.5 * controlX + 0.25 * targetX,
    labelY: 0.25 * sourceY + 0.5 * controlY + 0.25 * targetY,
  };
}

function hashSign(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return hash & 1 ? 1 : -1;
}

function hashScale(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 33 + id.charCodeAt(i)) | 0;
  const unit = ((hash >>> 0) % 1000) / 1000;
  return 0.72 + unit * 0.56;
}

function EdgeLabelInput({
  initial,
  onCommit,
  onCancel,
}: {
  initial: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const done = useRef(false);

  function finish(save: boolean) {
    if (done.current) return;
    done.current = true;
    if (save) onCommit(draft);
    else onCancel();
  }

  return (
    <div
      className="nodrag nopan w-36"
      onPointerDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <Input
        autoFocus
        value={draft}
        placeholder="Label"
        aria-label="Relationship label"
        className="h-6 bg-background text-[11px] shadow-sm"
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            finish(true);
          }
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            finish(false);
          }
        }}
        onBlur={() => finish(true)}
      />
    </div>
  );
}

export function MindMapFlowEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  style,
  markerEnd,
  markerStart,
  label,
  selected,
}: EdgeProps) {
  const api = useContext(EdgeLabelContext);
  const { zoom } = useViewport();
  const editing = api?.editingId === id;
  const [hovered, setHovered] = useState(false);
  const { path, labelX, labelY } = arcEdge(id, sourceX, sourceY, targetX, targetY);
  const text = labelText(label);
  const revealed = hovered || editing || Boolean(selected);
  const thicken = hovered || editing || Boolean(selected);
  const restOpacity = typeof style?.opacity === "number" ? style.opacity : 0.2;

  return (
    <>
      <g
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={(event) => {
          event.stopPropagation();
          api?.select(id);
        }}
      >
        <BaseEdge
          id={id}
          path={path}
          markerEnd={markerEnd}
          markerStart={markerStart}
          interactionWidth={18}
          style={{
            ...style,
            cursor: "pointer",
            opacity: revealed ? 1 : restOpacity,
            strokeWidth:
              thicken && typeof style?.strokeWidth === "number"
                ? style.strokeWidth + 0.6
                : style?.strokeWidth,
            transition: "opacity 140ms ease, stroke-width 140ms ease",
          }}
        />
      </g>
      {revealed && editing && api ? (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan absolute"
            style={{
              ...labelPosition(labelX, labelY, zoom),
              pointerEvents: "all",
            }}
          >
            <EdgeLabelInput
              initial={text}
              onCommit={(value) => api.commit(id, value)}
              onCancel={api.cancel}
            />
          </div>
        </EdgeLabelRenderer>
      ) : null}
      {revealed && !editing && text ? (
        <EdgeLabelRenderer>
          <div
            className="pointer-events-none absolute rounded-full bg-background/95 px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground shadow-sm ring-1 ring-foreground/10"
            style={labelPosition(labelX, labelY, zoom)}
          >
            {text}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}
