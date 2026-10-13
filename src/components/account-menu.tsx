"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

export type AccountProfile = {
  name: string;
  linkedIn: string;
  company: string;
  position: string;
};

export function AccountMenu({ profile }: { profile: AccountProfile }) {
  const router = useRouter();
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [linkedIn, setLinkedIn] = useState(profile.linkedIn);
  const [company, setCompany] = useState(profile.company);
  const [position, setPosition] = useState(profile.position);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLinkedIn(profile.linkedIn);
    setCompany(profile.company);
    setPosition(profile.position);
  }, [profile.linkedIn, profile.company, profile.position]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function edit(setter: (value: string) => void, value: string) {
    setter(value);
    setStatus("idle");
    setError(null);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setStatus("saving");
    setError(null);
    const next = {
      linkedin: linkedIn.trim(),
      company: company.trim(),
      position: position.trim(),
    };
    const { error: saveError } = await createClient().auth.updateUser({
      data: next,
    });
    if (saveError) {
      setStatus("error");
      setError(saveError.message);
      return;
    }
    setLinkedIn(next.linkedin);
    setCompany(next.company);
    setPosition(next.position);
    setStatus("saved");
    router.refresh();
  }

  const name = profile.name || "Account";

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        title="Profile"
        className="inline-flex h-7 max-w-44 items-center gap-1.5 rounded-full border border-border bg-background py-0.5 pr-2.5 pl-1 text-[0.8rem] font-medium hover:bg-muted"
        onClick={() => setOpen((value) => !value)}
      >
        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold uppercase">
          {name.charAt(0)}
        </span>
        <span className="truncate">{name}</span>
      </button>
      {open ? (
        <div
          id={panelId}
          role="dialog"
          aria-label="Profile"
          className="absolute right-0 top-full z-50 mt-1 w-72 rounded-lg border bg-popover p-3 shadow-md"
        >
          <form onSubmit={onSubmit} className="space-y-3">
            <p className="text-sm font-medium">Profile</p>
            <div className="space-y-1.5">
              <Label htmlFor={`${panelId}-linkedin`} className="text-xs">
                LinkedIn
              </Label>
              <Input
                id={`${panelId}-linkedin`}
                value={linkedIn}
                onChange={(event) => edit(setLinkedIn, event.target.value)}
                placeholder="Optional"
                autoComplete="url"
                spellCheck={false}
                className="h-8"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${panelId}-company`} className="text-xs">
                Company
              </Label>
              <Input
                id={`${panelId}-company`}
                value={company}
                onChange={(event) => edit(setCompany, event.target.value)}
                placeholder="Optional"
                autoComplete="organization"
                className="h-8"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${panelId}-position`} className="text-xs">
                Position
              </Label>
              <Input
                id={`${panelId}-position`}
                value={position}
                onChange={(event) => edit(setPosition, event.target.value)}
                placeholder="Optional"
                autoComplete="organization-title"
                className="h-8"
              />
            </div>
            {error ? (
              <p className="text-xs text-destructive">{error}</p>
            ) : null}
            {status === "saved" ? (
              <p className="text-xs text-muted-foreground">Saved</p>
            ) : null}
            <Button
              type="submit"
              size="sm"
              className="w-full"
              disabled={status === "saving"}
            >
              {status === "saving" ? "Saving…" : "Save profile"}
            </Button>
          </form>
          <form action="/auth/signout" method="post" className="mt-2 border-t pt-2">
            <button
              type="submit"
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
            >
              <LogOut className="size-3.5" />
              Sign out
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
