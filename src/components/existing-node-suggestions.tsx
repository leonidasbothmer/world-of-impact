"use client";

import { NODE_TYPE_CONFIG } from "@/lib/node-styles";
import { cn } from "@/lib/utils";
import type { MindMapNode } from "@/types/mindmap";

function highlightName(name: string, query: string) {
  const index = name.toLowerCase().indexOf(query);
  if (index < 0) return name;
  return (
    <>
      {name.slice(0, index)}
      <span className="font-semibold text-foreground">
        {name.slice(index, index + query.length)}
      </span>
      {name.slice(index + query.length)}
    </>
  );
}

export function ExistingNodeSuggestions({
  nodes,
  query,
  activeIndex,
  listId,
  onHover,
  onSelect,
}: {
  nodes: MindMapNode[];
  query: string;
  activeIndex: number;
  listId: string;
  onHover: (index: number) => void;
  onSelect: (node: MindMapNode) => void;
}) {
  const trimmed = query.trim().toLowerCase();
  if (nodes.length === 0 || !trimmed) return null;

  return (
    <ul
      id={listId}
      role="listbox"
      aria-label="Existing nodes"
      className="max-h-48 overflow-y-auto rounded-lg border bg-popover p-1 shadow-md"
    >
      {nodes.map((node, index) => {
        const type = NODE_TYPE_CONFIG[node.type];
        const active = index === activeIndex;
        return (
          <li key={node.id} role="presentation">
            <button
              id={`${listId}-option-${node.id}`}
              type="button"
              role="option"
              aria-selected={active}
              className={cn(
                "group flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm",
                active ? "bg-muted text-foreground" : "hover:bg-muted",
              )}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => onHover(index)}
              onClick={() => onSelect(node)}
            >
              <span
                className={cn("h-2 w-2 shrink-0 rounded-full", type.dot)}
              />
              <span className="min-w-0 flex-1 truncate text-muted-foreground">
                {highlightName(node.name, trimmed)}
              </span>
              <span
                className={cn(
                  "shrink-0 text-[10px] text-muted-foreground",
                  active ? "hidden" : "group-hover:hidden",
                )}
              >
                {type.label}
              </span>
              <span
                className={cn(
                  "shrink-0 text-[10px] font-medium text-foreground",
                  active ? "inline" : "hidden group-hover:inline",
                )}
              >
                Select existing
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
