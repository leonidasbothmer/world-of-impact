"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function LinkedInField({
  id,
  value,
  onChange,
  error,
  disabled,
  className,
  labelClassName,
  inputClassName,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
  disabled?: boolean;
  className?: string;
  labelClassName?: string;
  inputClassName?: string;
}) {
  return (
    <div className={cn("space-y-1", className)}>
      <Label htmlFor={id} className={labelClassName}>
        LinkedIn
      </Label>
      <Input
        id={id}
        value={value}
        disabled={disabled}
        placeholder="Optional — adds photo and notes"
        autoComplete="off"
        spellCheck={false}
        className={inputClassName}
        onChange={(event) => onChange(event.target.value)}
      />
      {error ? <p className="text-[11px] text-destructive">{error}</p> : null}
    </div>
  );
}
