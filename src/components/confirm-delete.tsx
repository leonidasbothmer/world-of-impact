"use client";

import { useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ConfirmDelete({
  onConfirm,
  label,
  prompt = "Delete?",
  size = "icon",
  className,
}: {
  onConfirm: () => void;
  label: string;
  prompt?: string;
  size?: "icon" | "icon-xs";
  className?: string;
}) {
  const [armed, setArmed] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!armed) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setArmed(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setArmed(false);
    }
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [armed]);

  if (!armed) {
    return (
      <Button
        type="button"
        variant="ghost"
        size={size}
        className={cn("shrink-0", className)}
        onClick={() => setArmed(true)}
        aria-label={label}
      >
        <Trash2 />
      </Button>
    );
  }

  return (
    <span
      ref={rootRef}
      role="group"
      aria-label={label}
      className="inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap rounded-md border bg-background px-1 py-0.5 text-[11px] leading-none shadow-sm"
    >
      <span className="px-0.5 text-muted-foreground">{prompt}</span>
      <button
        type="button"
        className="rounded px-1 py-0.5 font-medium text-destructive hover:bg-destructive/10"
        onClick={onConfirm}
      >
        Yes
      </button>
      <button
        type="button"
        className="rounded px-1 py-0.5 text-muted-foreground hover:bg-muted"
        onClick={() => setArmed(false)}
      >
        No
      </button>
    </span>
  );
}
