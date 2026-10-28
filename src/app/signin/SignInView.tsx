"use client";

import { LogIn, UserPlus } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { setAccount, useAccount } from "@/components/useAccount";
import { Button } from "@/components/ui/Button";
import { Banner } from "@/components/ui/Feedback";
import { Field } from "@/components/ui/Form";
import { Segmented } from "@/components/ui/Tabs";
import { call } from "@/lib/client";
import { safeReturnPath } from "@/lib/urls";
import type { Account } from "@/lib/types";

type Mode = "signin" | "signup";
const MODES = [
  { key: "signin" as const, label: "Sign in" },
  { key: "signup" as const, label: "Create account" },
];

export function SignInView() {
  const params = useSearchParams();
  const { user } = useAccount();
  const mode: Mode = params.get("mode") === "signup" ? "signup" : "signin";
  const setMode = (value: Mode) => {
    const url = new URL(window.location.href);
    url.searchParams.set("mode", value);
    window.history.replaceState(null, "", url);
  };
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const next = safeReturnPath(params.get("next"));

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const body = mode === "signup" ? { action: "signup", username, email, password } : { action: "signin", email, password };
      const { user } = await call<{ user: Account }>("/api/auth", "POST", body);
      setAccount(user);
      // A full load, so the tracker, calendar and everything else load this account's own data.
      window.location.assign(next);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (user) {
    return (
      <div className="mx-auto max-w-md space-y-3">
        <h1 className="page-title">You&apos;re signed in</h1>
        <p className="text-sm text-muted">Signed in as @{user.username}.</p>
        <div className="flex gap-2">
          <Link href="/profile" className="btn btn-primary">Your profile</Link>
          <Link href="/?show=people" className="btn">See people</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-4">
      <div>
        <h1 className="page-title">{mode === "signup" ? "Create your account" : "Welcome back"}</h1>
        <p className="text-sm text-muted">
          {mode === "signup"
            ? "You get your own tracker, ideas and results, and a profile under Discover → People so others can find you for a team. Your email stays private."
            : "Sign in to edit the profile others see under Discover → People."}
        </p>
      </div>
      <Segmented options={MODES} value={mode} onChange={(m) => { setMode(m); setError(null); }} label="Sign in or create an account" />
      <form
        className="card space-y-3 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {mode === "signup" && (
          <Field label="Username" hint="Your profile link: 3 to 24 letters, numbers, - or _.">
            {(c) => <input {...c} className="input" autoComplete="username" required minLength={3} maxLength={24} pattern="[A-Za-z0-9][A-Za-z0-9_\-]{2,23}" value={username} onChange={(e) => setUsername(e.target.value)} />}
          </Field>
        )}
        <Field label="Email">
          {(c) => <input {...c} className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />}
        </Field>
        <Field label="Password" hint={mode === "signup" ? "At least 8 characters." : undefined}>
          {(c) => (
            <input
              {...c}
              className="input"
              type="password"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              required
              minLength={mode === "signup" ? 8 : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          )}
        </Field>
        {error && <Banner tone="danger">{error}</Banner>}
        <Button
          type="submit"
          variant="primary"
          className="w-full justify-center"
          loading={busy}
          icon={mode === "signup" ? <UserPlus aria-hidden className="size-4" /> : <LogIn aria-hidden className="size-4" />}
        >
          {mode === "signup" ? "Create account" : "Sign in"}
        </Button>
      </form>
    </div>
  );
}
