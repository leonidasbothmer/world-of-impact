"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { Handle, Position, useConnection, type NodeProps } from "@xyflow/react";
import { Pin } from "lucide-react";
import { cn } from "@/lib/utils";
import { NODE_TYPE_CONFIG } from "@/lib/node-styles";
import type { NodeHighlight } from "@/lib/selection-highlight";
import type { MindMapNode, NodeType } from "@/types/mindmap";

export type MindMapNodeData = {
  node: MindMapNode;
  onUnpin?: (id: string) => void;
  highlight?: NodeHighlight;
};

function highlightRing(selected?: boolean, highlight?: NodeHighlight) {
  if (selected || highlight === "endpoint") {
    return "ring-2 ring-offset-1 ring-primary shadow-md";
  }
  if (highlight === "neighbor") return "ring-2 ring-offset-1 ring-primary/30";
  return undefined;
}

function initialsFromName(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

const centerHandleStyle = {
  top: "50%",
  left: "50%",
  transform: "translate(-50%, -50%)",
  pointerEvents: "none" as const,
};

function CenterHandles() {
  return (
    <>
      <Handle
        id="center"
        type="target"
        position={Position.Top}
        className="!h-px !w-px !min-h-0 !min-w-0 !border-0 !bg-transparent !opacity-0 !pointer-events-none"
        style={centerHandleStyle}
      />
      <Handle
        id="center"
        type="source"
        position={Position.Bottom}
        className="!h-px !w-px !min-h-0 !min-w-0 !border-0 !bg-transparent !opacity-0 !pointer-events-none"
        style={centerHandleStyle}
      />
    </>
  );
}

const EDGE_OFFSET = "8px";

const ANCHORS: {
  id: string;
  position: Position;
  style: { top: string; left: string };
}[] = [
  { id: "n", position: Position.Top, style: { top: `-${EDGE_OFFSET}`, left: "50%" } },
  { id: "e", position: Position.Right, style: { top: "50%", left: `calc(100% + ${EDGE_OFFSET})` } },
  { id: "s", position: Position.Bottom, style: { top: `calc(100% + ${EDGE_OFFSET})`, left: "50%" } },
  { id: "w", position: Position.Left, style: { top: "50%", left: `-${EDGE_OFFSET}` } },
];

function ConnectionAnchors({
  selected,
  connectable,
}: {
  selected?: boolean;
  connectable: boolean;
}) {
  return (
    <>
      {ANCHORS.map((anchor) => (
        <Handle
          key={anchor.id}
          id={anchor.id}
          type="source"
          position={anchor.position}
          isConnectable={connectable}
          className={cn(
            "nodrag nopan !h-1 !w-1 !min-h-0 !min-w-0 !rounded-full !border-0 !bg-black",
            "hover:!scale-100 hover:!bg-black hover:!outline hover:!outline-1 hover:!outline-offset-1 hover:!outline-neutral-400",
            selected
              ? "!opacity-100 !pointer-events-auto"
              : "!opacity-0 !pointer-events-none",
          )}
          style={{
            ...anchor.style,
            width: 4,
            height: 4,
            background: "#000",
            borderRadius: "9999px",
            transform: "translate(-50%, -50%)",
          }}
        />
      ))}
    </>
  );
}

function DropTarget({ active }: { active: boolean }) {
  return (
    <Handle
      id="drop"
      type="target"
      position={Position.Top}
      className={cn(
        "!absolute !inset-0 !left-0 !top-0 !h-full !w-full !min-h-0 !min-w-0 !rounded-[inherit] !border-0 !bg-transparent !opacity-0",
        active ? "!pointer-events-auto" : "!pointer-events-none",
      )}
      style={{ transform: "none" }}
    />
  );
}

function PinBadge({
  pinned,
  onUnpin,
}: {
  pinned?: boolean;
  onUnpin?: () => void;
}) {
  if (!pinned) return null;
  return (
    <button
      type="button"
      className="nodrag nopan absolute -top-1.5 -right-1.5 z-10 flex h-4 w-4 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-sm hover:text-foreground"
      aria-label="Unpin node"
      onClick={(event) => {
        event.stopPropagation();
        onUnpin?.();
      }}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <Pin className="h-2.5 w-2.5 fill-current" />
    </button>
  );
}

function useDropHover(id: string) {
  const connection = useConnection();
  const connecting = connection.inProgress;
  const fromId = connection.fromNode?.id;
  const isSource = connecting && fromId === id;
  const dropHover = connecting && fromId !== id && connection.toNode?.id === id;
  const dropActive = connecting && !isSource;
  return { connecting, isSource, dropHover, dropActive };
}

function AvatarTileNode({
  id,
  node,
  selected,
  highlight,
  rounded,
  onUnpin,
}: {
  id: string;
  node: MindMapNode;
  selected?: boolean;
  highlight?: NodeHighlight;
  rounded: "full" | "2xl";
  onUnpin?: (id: string) => void;
}) {
  const style = NODE_TYPE_CONFIG[node.type as NodeType];
  const initials = initialsFromName(node.name);
  const { dropHover, dropActive } = useDropHover(id);

  return (
    <div className="relative flex flex-col items-center gap-1">
      <CenterHandles />
      <div className="relative">
        <PinBadge pinned={node.pinned} onUnpin={() => onUnpin?.(node.id)} />
        <div
          className={cn(
            "relative h-10 w-10 overflow-visible border-2 shadow-sm transition-shadow box-border",
            rounded === "full" ? "rounded-full" : "rounded-xl",
            style.border,
            style.bg,
            highlightRing(selected, highlight),
            dropHover && "ring-2 ring-offset-2 ring-sky-500 shadow-md",
          )}
        >
          <div
            className={cn(
              "absolute inset-0 grid place-items-center overflow-hidden leading-none",
              rounded === "full" ? "rounded-full" : "rounded-[10px]",
            )}
          >
            {node.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- remote LinkedIn/OG hotlinks by design
              <img
                src={node.imageUrl}
                alt=""
                className="h-full w-full object-cover"
                draggable={false}
                referrerPolicy="no-referrer"
              />
            ) : (
              <span
                className={cn(
                  "block text-center text-[10px] font-semibold leading-none",
                  style.text,
                )}
              >
                {initials || "?"}
              </span>
            )}
          </div>
          <DropTarget active={dropActive} />
          <ConnectionAnchors selected={selected} connectable={!!selected} />
        </div>
      </div>
      <p
        className={cn(
          "max-w-[100px] text-center text-[10px] font-semibold leading-tight",
          style.text,
        )}
      >
        {node.name}
      </p>
    </div>
  );
}

/** Content width inside the old 160px box (padding and border included). */
const LABEL_LINE_MAX = 142;

function wrapLabelLines(
  text: string,
  maxWidth: number,
  measure: (value: string) => number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [text];
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (!current || measure(next) <= maxWidth) current = next;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function useHuggedLabelLines(text: string) {
  const measureRef = useRef<HTMLSpanElement>(null);
  const [lines, setLines] = useState<string[]>([text]);

  useLayoutEffect(() => {
    const probe = measureRef.current;
    if (!probe) return;
    const measure = (value: string) => {
      probe.textContent = value;
      return probe.offsetWidth;
    };
    const next = wrapLabelLines(text, LABEL_LINE_MAX, measure);
    setLines((prev) =>
      prev.length === next.length && prev.every((line, i) => line === next[i])
        ? prev
        : next,
    );
  }, [text]);

  return { lines, measureRef };
}

function BoxedLabelNode({
  id,
  node,
  selected,
  highlight,
  onUnpin,
}: {
  id: string;
  node: MindMapNode;
  selected?: boolean;
  highlight?: NodeHighlight;
  onUnpin?: (id: string) => void;
}) {
  const style = NODE_TYPE_CONFIG[node.type as NodeType];
  const { dropHover, dropActive } = useDropHover(id);
  const { lines, measureRef } = useHuggedLabelLines(node.name);

  return (
    <div
      className={cn(
        "relative w-fit rounded-md border px-2 py-1 shadow-sm",
        style.bg,
        style.border,
        style.text,
        highlightRing(selected, highlight),
        dropHover && "ring-2 ring-offset-2 ring-sky-500 shadow-md",
      )}
    >
      <span
        ref={measureRef}
        className="pointer-events-none absolute whitespace-nowrap text-xs font-semibold opacity-0"
        aria-hidden
      />
      <CenterHandles />
      <PinBadge pinned={node.pinned} onUnpin={() => onUnpin?.(node.id)} />
      <p className="flex w-fit flex-col items-center text-center text-xs font-semibold leading-tight">
        {lines.map((line, index) => (
          <span key={`${index}-${line}`} className="whitespace-nowrap">
            {line}
          </span>
        ))}
      </p>
      <DropTarget active={dropActive} />
      <ConnectionAnchors selected={selected} connectable={!!selected} />
    </div>
  );
}

export function MindMapFlowNode({ id, data, selected }: NodeProps) {
  const { node, onUnpin, highlight } = data as MindMapNodeData;

  if (node.type === "person") {
    return (
      <AvatarTileNode
        id={id}
        node={node}
        selected={selected}
        highlight={highlight}
        rounded="full"
        onUnpin={onUnpin}
      />
    );
  }

  if (node.type === "organization") {
    return (
      <AvatarTileNode
        id={id}
        node={node}
        selected={selected}
        highlight={highlight}
        rounded="2xl"
        onUnpin={onUnpin}
      />
    );
  }

  return (
    <BoxedLabelNode
      id={id}
      node={node}
      selected={selected}
      highlight={highlight}
      onUnpin={onUnpin}
    />
  );
}
