"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import {
  assignFieldRef,
  FieldClearButton,
  fieldText,
  setNativeFieldValue,
} from "@/components/ui/field-clear";

function Textarea({
  className,
  value,
  defaultValue,
  disabled,
  readOnly,
  onChange,
  ref,
  ...props
}: React.ComponentProps<"textarea">) {
  const areaRef = React.useRef<HTMLTextAreaElement>(null);
  const controlled = value != null;
  const [uncontrolledValue, setUncontrolledValue] = React.useState(() =>
    fieldText(defaultValue),
  );
  const text = controlled ? fieldText(value) : uncontrolledValue;
  const clearable = !disabled && !readOnly && text.length > 0;

  function clear() {
    const element = areaRef.current;
    if (!element) return;
    setNativeFieldValue(element, "");
    if (!controlled) setUncontrolledValue("");
    element.focus();
  }

  return (
    <div className="relative w-full min-w-0">
      <textarea
        ref={(node) => {
          areaRef.current = node;
          assignFieldRef(ref, node);
        }}
        value={value}
        defaultValue={defaultValue}
        disabled={disabled}
        readOnly={readOnly}
        data-slot="textarea"
        className={cn(
          "flex field-sizing-content min-h-16 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
          className,
          clearable && "pr-7",
        )}
        onChange={(event) => {
          if (!controlled) setUncontrolledValue(event.target.value);
          onChange?.(event);
        }}
        {...props}
      />
      {clearable ? (
        <FieldClearButton onClear={clear} className="top-1.5 right-1" />
      ) : null}
    </div>
  );
}

export { Textarea };
