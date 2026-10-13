"use client";

import * as React from "react";
import { Input as InputPrimitive } from "@base-ui/react/input";
import { cn } from "@/lib/utils";
import {
  assignFieldRef,
  FieldClearButton,
  fieldText,
  isClearableInputType,
  setNativeFieldValue,
} from "@/components/ui/field-clear";

function Input({
  className,
  type,
  value,
  defaultValue,
  disabled,
  readOnly,
  onChange,
  ref,
  ...props
}: React.ComponentProps<"input">) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const controlled = value != null;
  const [uncontrolledValue, setUncontrolledValue] = React.useState(() =>
    fieldText(defaultValue),
  );
  const text = controlled ? fieldText(value) : uncontrolledValue;
  const clearable =
    isClearableInputType(type) && !disabled && !readOnly && text.length > 0;

  function clear() {
    const element = inputRef.current;
    if (!element) return;
    setNativeFieldValue(element, "");
    if (!controlled) setUncontrolledValue("");
    element.focus();
  }

  return (
    <div className="relative w-full min-w-0">
      <InputPrimitive
        ref={(node: HTMLInputElement | null) => {
          inputRef.current = node;
          assignFieldRef(ref, node);
        }}
        type={type}
        value={value}
        defaultValue={defaultValue}
        disabled={disabled}
        readOnly={readOnly}
        data-slot="input"
        className={cn(
          "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
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
        <FieldClearButton
          onClear={clear}
          className="top-1/2 right-1 -translate-y-1/2"
        />
      ) : null}
    </div>
  );
}

export { Input };
