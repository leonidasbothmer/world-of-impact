"use client";

import type { ReactNode, Ref } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export function FilterChip({
  pressed,
  open,
  label,
  ariaLabel,
  title,
  onClick,
  onClear,
  clearLabel,
  buttonRef,
  menu = true,
}: {
  pressed: boolean;
  open: boolean;
  label: ReactNode;
  ariaLabel: string;
  title?: string;
  onClick: () => void;
  onClear?: () => void;
  clearLabel?: string;
  buttonRef?: Ref<HTMLButtonElement>;
  /** Status and date filters open a menu. A role tag does not. */
  menu?: boolean;
}) {
  return (
    <div
      className={cn(
        "inline-flex h-6 shrink-0 items-center rounded-md text-xs",
        pressed || open
          ? "bg-muted text-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <button
        ref={buttonRef}
        type="button"
        aria-label={ariaLabel}
        aria-expanded={menu ? open : undefined}
        aria-haspopup={menu ? "dialog" : undefined}
        title={title}
        className="inline-flex h-full items-center gap-1 px-2 font-medium whitespace-nowrap outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        onClick={onClick}
      >
        {label}
      </button>
      {pressed && onClear ? (
        <button
          type="button"
          aria-label={clearLabel}
          className="mr-1 inline-flex size-4 items-center justify-center rounded-sm text-muted-foreground hover:bg-background hover:text-foreground"
          onMouseDown={(event) => event.preventDefault()}
          onClick={onClear}
        >
          <X className="size-3" />
        </button>
      ) : null}
    </div>
  );
}
