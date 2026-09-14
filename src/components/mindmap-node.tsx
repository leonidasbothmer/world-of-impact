"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { cn } from "@/lib/utils";
import { NODE_TYPE_CONFIG } from "@/lib/node-styles";
import type { MindMapNode, NodeType } from "@/types/mindmap";

export type MindMapNodeData = {
  node: MindMapNode;
};

function PersonAvatarNode({
  node,
  selected,
}: {
  node: MindMapNode;
  selected?: boolean;
}) {
  const style = NODE_TYPE_CONFIG.person;
  const initials = node.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
  const contacted = node.tags?.includes("contacted");

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative">
        <Handle
          type="target"
          position={Position.Top}
          className="!bg-muted-foreground !-top-1"
        />
        <div
          className={cn(
            "h-16 w-16 overflow-hidden rounded-full border-2 shadow-sm transition-shadow",
            style.border,
            style.bg,
            selected && "ring-2 ring-offset-2 ring-primary shadow-md",
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
            <div
              className={cn(
                "flex h-full w-full items-center justify-center text-sm font-semibold",
                style.text,
              )}
            >
              {initials || "?"}
            </div>
          )}
        </div>
        <Handle
          type="source"
          position={Position.Bottom}
          className="!bg-muted-foreground !-bottom-1"
        />
      </div>
      <p
        className={cn(
          "max-w-[140px] text-center text-xs font-semibold leading-tight",
          style.text,
        )}
      >
        {node.name}
      </p>
      {contacted && (
        <span className="rounded-full bg-violet-100 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-violet-700">
          contacted
        </span>
      )}
    </div>
  );
}

export function MindMapFlowNode({ data, selected }: NodeProps) {
  const node = (data as MindMapNodeData).node;

  if (node.type === "person") {
    return <PersonAvatarNode node={node} selected={selected} />;
  }

  const style = NODE_TYPE_CONFIG[node.type as NodeType];

  return (
    <div
      className={cn(
        "min-w-[140px] max-w-[200px] rounded-lg border-2 px-3 py-2 shadow-sm transition-shadow",
        style.bg,
        style.border,
        style.text,
        selected && "ring-2 ring-offset-2 ring-primary shadow-md",
      )}
    >
      <Handle type="target" position={Position.Top} className="!bg-muted-foreground" />
      <div className="flex items-center gap-1.5 mb-1">
        {node.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- remote org logos by reference
          <img
            src={node.imageUrl}
            alt=""
            className="h-5 w-5 shrink-0 rounded-sm object-cover"
            draggable={false}
            referrerPolicy="no-referrer"
          />
        ) : (
          <span className={cn("h-2 w-2 rounded-full shrink-0", style.dot)} />
        )}
        <span className="text-[10px] uppercase tracking-wide opacity-70 font-medium">
          {style.label}
        </span>
      </div>
      <p className="text-sm font-semibold leading-tight">{node.name}</p>
      {node.tags && node.tags.length > 0 && (
        <p className="mt-1 text-[10px] opacity-60 truncate">
          {node.tags.slice(0, 3).join(" · ")}
        </p>
      )}
      <Handle type="source" position={Position.Bottom} className="!bg-muted-foreground" />
    </div>
  );
}
