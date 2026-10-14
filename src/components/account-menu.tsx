"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { ChevronLeft, LogOut, UserRound } from "lucide-react";
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
  const [panel, setPanel] = useState<"menu" | "profile">("menu");
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

  function close() {
    setOpen(false);
    setPanel("menu");
  }

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) close();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (panel === "profile") setPanel("menu");
        else close();
      }
    }
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, panel]);

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
        title="Account"
        className="inline-flex h-7 max-w-44 items-center gap-1.5 rounded-full border border-border bg-background py-0.5 pr-2.5 pl-1 text-[0.8rem] font-medium hover:bg-muted"
        onClick={() => {
          if (open) close();
          else setOpen(true);
        }}
      >
        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold uppercase">
          {name.charAt(0)}
        </span>
        <span className="truncate">{name}</span>
      </button>
      {open ? (
        <div
          id={panelId}
          role={panel === "profile" ? "dialog" : "menu"}
          aria-label={panel === "profile" ? "Profile" : "Account"}
          className={`absolute right-0 top-full z-50 mt-1 rounded-lg border bg-popover shadow-md ${panel === "profile" ? "w-72 p-3" : "w-52 p-1.5"}`}
        >
          {panel === "menu" ? (
            <>
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                onClick={() => setPanel("profile")}
              >
                <UserRound className="size-3.5" />
                Profile
              </button>
              <form action="/auth/signout" method="post" className="mt-1 border-t pt-1">
                <button
                  type="submit"
                  role="menuitem"
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                >
                  <LogOut className="size-3.5" />
                  Sign out
                </button>
              </form>
            </>
          ) : (
          <form onSubmit={onSubmit} className="space-y-3">
            <button
              type="button"
              className="inline-flex items-center gap-1 text-sm font-medium"
              onClick={() => setPanel("menu")}
            >
              <ChevronLeft className="size-3.5" />
              Profile
            </button>
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
          )}
        </div>
      ) : null}
    </div>
  );
}
