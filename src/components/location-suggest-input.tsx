"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Input } from "@/components/ui/input";
import { matchLocations } from "@/lib/locations";
import { cn } from "@/lib/utils";

type LocationSuggestInputProps = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  onCommit: (value: string) => void;
  catalog: string[];
  taken: string[];
  placeholder?: string;
  "aria-label"?: string;
  className?: string;
  wrapperClassName?: string;
  inputRef?: (element: HTMLInputElement | null) => void;
  onEmptyBackspace?: () => void;
  onNavigate?: (delta: number) => void;
  onDismiss?: () => void;
};

export function LocationSuggestInput({
  id,
  value,
  onChange,
  onCommit,
  catalog,
  taken,
  placeholder,
  className,
  wrapperClassName = "w-full",
  inputRef,
  onEmptyBackspace,
  onNavigate,
  onDismiss,
  ...props
}: LocationSuggestInputProps) {
  const listId = useId();
  const fieldRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [box, setBox] = useState<DOMRect | null>(null);
  const suggestions = matchLocations(catalog, value, taken);
  const open = focused && !dismissed && suggestions.length > 0;
  const activeIndex = Math.min(highlight, Math.max(suggestions.length - 1, 0));
  const ariaLabel = props["aria-label"];

  useEffect(() => {
    setHighlight(0);
    setDismissed(false);
  }, [value]);

  useEffect(() => {
    const element = fieldRef.current;
    if (!open || !element) return;
    function place() {
      if (fieldRef.current) setBox(fieldRef.current.getBoundingClientRect());
    }
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, value, suggestions.length]);

  function commit(raw: string) {
    if (!raw.trim()) return;
    onCommit(raw);
  }

  function acceptSuggestion() {
    const selected = suggestions[activeIndex];
    if (!selected) return;
    commit(selected);
  }

  const behavior = useRef({
    value,
    open,
    suggestions,
    activeIndex,
    commit,
    acceptSuggestion,
    onEmptyBackspace,
    onNavigate,
    onDismiss,
  });
  behavior.current = {
    value,
    open,
    suggestions,
    activeIndex,
    commit,
    acceptSuggestion,
    onEmptyBackspace,
    onNavigate,
    onDismiss,
  };

  useLayoutEffect(() => {
    const element = fieldRef.current;
    if (!element) return;
    const input = element;

    function onFocus() {
      setFocused(true);
    }
    function onBlur() {
      const current = behavior.current;
      setFocused(false);
      if (current.open) current.acceptSuggestion();
      else current.commit(input.value);
      current.onDismiss?.();
    }
    function onKeyDown(event: KeyboardEvent) {
      const current = behavior.current;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        if (current.open) {
          const delta = event.key === "ArrowDown" ? 1 : -1;
          setHighlight((index) => {
            const clamped = Math.min(index, current.suggestions.length - 1);
            return (
              (clamped + delta + current.suggestions.length) %
              current.suggestions.length
            );
          });
        } else {
          current.onNavigate?.(event.key === "ArrowDown" ? 1 : -1);
        }
        return;
      }
      if (event.key === "Escape" && current.open) {
        event.preventDefault();
        setDismissed(true);
        return;
      }
      if (event.key === "Tab" && !event.shiftKey && current.open) {
        event.preventDefault();
        current.acceptSuggestion();
        return;
      }
      if (event.key === "Enter" || event.key === ",") {
        event.preventDefault();
        if (current.open) current.acceptSuggestion();
        else current.commit(current.value);
        return;
      }
      if (event.key === "Backspace" && current.value === "") {
        event.preventDefault();
        current.onEmptyBackspace?.();
      }
    }

    element.addEventListener("focus", onFocus);
    element.addEventListener("blur", onBlur);
    element.addEventListener("keydown", onKeyDown);
    if (document.activeElement === element) onFocus();
    return () => {
      element.removeEventListener("focus", onFocus);
      element.removeEventListener("blur", onBlur);
      element.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const placeAbove =
    box != null && box.bottom + 180 > window.innerHeight && box.top > 180;

  return (
    <span className={cn("relative inline-flex min-w-0", wrapperClassName)}>
      <Input
        ref={(element) => {
          fieldRef.current = element;
          inputRef?.(element);
        }}
        id={id}
        value={value}
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? `${listId}-${activeIndex}` : undefined}
        aria-autocomplete="list"
        placeholder={placeholder}
        className={className}
        onChange={(event) => onChange(event.target.value)}
      />
      {open && box
        ? createPortal(
            <ul
              id={listId}
              role="listbox"
              aria-label="Existing locations"
              className="fixed z-50 max-h-48 min-w-40 overflow-auto rounded-md border bg-popover p-1 text-sm shadow-md"
              style={{
                left: box.left,
                width: Math.max(box.width, 160),
                top: placeAbove ? box.top - 4 : box.bottom + 4,
                transform: placeAbove ? "translateY(-100%)" : undefined,
              }}
            >
              {suggestions.map((label, index) => (
                <li key={label} role="presentation">
                  <button
                    type="button"
                    id={`${listId}-${index}`}
                    role="option"
                    aria-selected={index === activeIndex}
                    className={cn(
                      "flex w-full items-center justify-between gap-3 rounded-sm px-2 py-1 text-left text-xs",
                      index === activeIndex && "bg-muted",
                    )}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setHighlight(index)}
                    onClick={() => commit(label)}
                  >
                    {label}
                    {index === activeIndex ? (
                      <span className="text-[10px] text-muted-foreground">Tab</span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>,
            document.body,
          )
        : null}
    </span>
  );
}
