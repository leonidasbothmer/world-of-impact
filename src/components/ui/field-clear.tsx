"use client";

import type { Ref } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const NON_CLEARABLE_TYPES = new Set([
  "button",
  "checkbox",
  "color",
  "file",
  "hidden",
  "image",
  "radio",
  "range",
  "reset",
  "submit",
]);

export function isClearableInputType(type?: string) {
  return !type || !NON_CLEARABLE_TYPES.has(type);
}

export function fieldText(value: unknown) {
  if (typeof value === "string" || typeof value === "number") return String(value);
  return "";
}

export function setNativeFieldValue(
  element: HTMLInputElement | HTMLTextAreaElement,
  value: string,
) {
  const prototype =
    element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

export function assignFieldRef<T>(ref: Ref<T> | undefined, node: T | null) {
  if (typeof ref === "function") ref(node);
  else if (ref) ref.current = node;
}

export function FieldClearButton({
  onClear,
  className,
}: {
  onClear: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label="Clear"
      className={cn(
        "absolute z-10 flex size-5 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground",
        className,
      )}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClear}
    >
      <X className="size-3.5" />
    </button>
  );
}
