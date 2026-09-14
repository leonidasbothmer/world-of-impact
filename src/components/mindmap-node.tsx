"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { cn } from "@/lib/utils";
import { NODE_TYPE_CONFIG } from "@/lib/node-styles";
import type { MindMapNode, NodeType } from "@/types/mindmap";

export type MindMapNodeData = {
  node: MindMapNode;
};

export function MindMapFlowNode({ data, selected }: NodeProps) {
  const node = (data as MindMapNodeData).node;
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
        <span className={cn("h-2 w-2 rounded-full shrink-0", style.dot)} />
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
