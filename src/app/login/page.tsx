"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Mode = "signin" | "signup";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "working" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setStatus("working");
    setError(null);
    setInfo(null);
    try {
      const supabase = createClient();
      const trimmed = email.trim();
      if (mode === "signin") {
        const { error: signError } = await supabase.auth.signInWithPassword({
          email: trimmed,
          password,
        });
        if (signError) throw signError;
        router.replace("/");
        router.refresh();
        return;
      }

      const { data, error: signError } = await supabase.auth.signUp({
        email: trimmed,
        password,
      });
      if (signError) throw signError;

      // If email confirmation is off, a session is returned immediately.
      if (data.session) {
        router.replace("/");
        router.refresh();
        return;
      }

      setInfo(
        "Account created. If your project requires email confirmation, confirm once in your inbox, then sign in. Otherwise try signing in now.",
      );
      setMode("signin");
      setStatus("idle");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Authentication failed");
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">
            <Link href="/" className="hover:opacity-80">
              The <em className="font-serif font-normal italic">Berlin</em> Atlas
              for Social Progress
            </Link>
          </h1>
          <p className="text-sm text-muted-foreground">
            Sign in with email and password to edit the shared graph. Your
            contacts stay private to your account.
          </p>
        </div>

        <div
          className="inline-flex rounded-lg border bg-muted/40 p-0.5"
          role="tablist"
          aria-label="Auth mode"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === "signin"}
            className={
              mode === "signin"
                ? "rounded-md bg-background px-3 py-1 text-xs font-medium shadow-sm"
                : "rounded-md px-3 py-1 text-xs font-medium text-muted-foreground"
            }
            onClick={() => {
              setMode("signin");
              setError(null);
              setInfo(null);
            }}
          >
            Sign in
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "signup"}
            className={
              mode === "signup"
                ? "rounded-md bg-background px-3 py-1 text-xs font-medium shadow-sm"
                : "rounded-md px-3 py-1 text-xs font-medium text-muted-foreground"
            }
            onClick={() => {
              setMode("signup");
              setError(null);
              setInfo(null);
            }}
          >
            Create account
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete={
                mode === "signin" ? "current-password" : "new-password"
              }
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {info && (
            <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
              {info}
            </p>
          )}
          <Button
            type="submit"
            className="w-full"
            disabled={status === "working"}
          >
            {status === "working"
              ? "Working…"
              : mode === "signin"
                ? "Sign in"
                : "Create account"}
          </Button>
        </form>
      </div>
    </div>
  );
}
