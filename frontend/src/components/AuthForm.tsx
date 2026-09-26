"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Clapperboard } from "lucide-react";
import { api } from "@/lib/api";
import { setSession } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AuthForm({ mode }: { mode: "signup" | "login" }) {
  const router = useRouter();
  const params = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState(params.get("expired") ? "Your session expired — please sign in again." : "");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr("");
    if (mode === "signup" && password !== confirm) { setErr("Passwords don't match."); return; }
    setBusy(true);
    try {
      const r = mode === "signup" ? await api.signup(username, password) : await api.login(username, password);
      setSession(r.token, r.username);
      router.replace("/");
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }

  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-sm flex-col justify-center">
      <div className="rise rise-1 mb-8 flex items-center gap-2">
        <Clapperboard className="size-5" strokeWidth={2} />
        <span className="display text-2xl leading-none">Joti</span>
      </div>
      <h1 className="rise rise-2">{mode === "signup" ? "Create your account" : "Welcome back"}</h1>
      <p className="rise rise-2 mt-2 text-sm text-muted-foreground">
        {mode === "signup" ? "Your episodes and brand catalogue stay private to you." : "Sign in to get back to your episodes."}
      </p>
      <form onSubmit={submit} className="rise rise-3 mt-8 space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="username">Username</Label>
          <Input id="username" autoComplete="username" autoCapitalize="none" value={username} onChange={(e) => setUsername(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
        </div>
        {mode === "signup" && (
          <div className="space-y-1.5">
            <Label htmlFor="confirm">Confirm password</Label>
            <Input id="confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
          </div>
        )}
        {err && <p className="text-sm text-destructive">{err}</p>}
        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {busy ? "One moment…" : mode === "signup" ? "Create account" : "Sign in"}
        </Button>
      </form>
      <p className="rise rise-4 mt-6 text-sm text-muted-foreground">
        {mode === "signup" ? (
          <>Already have an account? <Link href="/login" className="text-foreground underline underline-offset-4">Sign in</Link></>
        ) : (
          <>New here? <Link href="/signup" className="text-foreground underline underline-offset-4">Create an account</Link></>
        )}
      </p>
    </div>
  );
}
