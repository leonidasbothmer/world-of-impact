import { EyeOff, Flag } from "lucide-react";
import { flagComment } from "@/lib/flags";
import { isHidden } from "@/lib/node-hide";
import type { MindMapNode } from "@/types/mindmap";

export function NodeRowMarks({
  node,
  onShow,
}: {
  node: MindMapNode;
  onShow?: () => void;
}) {
  const hidden = isHidden(node);
  const comment = flagComment(node);
  if (!hidden && comment == null) return null;
  return (
    <span className="inline-flex items-center justify-end gap-1 text-muted-foreground">
      {comment != null ? (
        <span title={comment || "Flagged"}>
          <Flag
            className="size-3.5 text-amber-500 dark:text-amber-400"
            fill="currentColor"
            aria-label={comment ? `Flag: ${comment}` : "Flagged"}
          />
        </span>
      ) : null}
      {hidden ? (
        onShow ? (
          <button
            type="button"
            className="inline-flex size-3.5 items-center justify-center rounded-sm hover:text-foreground"
            aria-label="Show on graph"
            title="Show on graph"
            onClick={onShow}
          >
            <EyeOff className="size-3.5" />
          </button>
        ) : (
          <EyeOff className="size-3.5" aria-label="Hidden on the graph" />
        )
      ) : null}
    </span>
  );
}
