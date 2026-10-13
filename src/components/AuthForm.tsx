"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useLocale, useT } from "@/lib/i18n/provider";
import type { Key } from "@/lib/i18n";

type Mode = "login" | "signup" | "forgot" | "reset";

function safeNext(next: string | null): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}
function mapError(message: string): Key {
  const m = message.toLowerCase();
  if (m.includes("invalid login")) return "auth.invalid";
  if (m.includes("not confirmed")) return "auth.notConfirmed";
  if (m.includes("rate limit") || m.includes("too many")) return "auth.rateLimited";
  if (m.includes("already registered") || m.includes("already been registered")) return "auth.emailTaken";
  if (m.includes("password")) return "auth.weakPassword";
  if (m.includes("fetch") || m.includes("network")) return "common.networkError";
  return "common.genericError";
}

export function AuthForm({ mode, next }: { mode: Mode; next?: string }) {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Key | null>(null);
  const [info, setInfo] = useState<Key | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    const supabase = createClient();
    const dest = safeNext(next ?? null);
    try {
      if (mode === "login") {
        const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (err) return setError(mapError(err.message));
        router.replace(dest);
        router.refresh();
      } else if (mode === "signup") {
        if (password.length < 8) return setError("auth.weakPassword");
        const { data, error: err } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { full_name: name.trim(), lang: locale }, emailRedirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(dest)}` },
        });
        if (err) return setError(mapError(err.message));
        if (data.user && data.user.identities?.length === 0) return setError("auth.emailTaken");
        if (data.session) {
          router.replace(dest);
          router.refresh();
        } else setInfo("auth.checkEmail");
      } else if (mode === "forgot") {
        await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${location.origin}/auth/callback?next=/reset` });
        setInfo("auth.resetSent"); // same message whether or not the account exists
      } else {
        if (password.length < 8) return setError("auth.weakPassword");
        const { error: err } = await supabase.auth.updateUser({ password });
        if (err) return setError(mapError(err.message));
        setInfo("auth.passwordUpdated");
        router.replace("/");
        router.refresh();
      }
    } catch (ex) {
      setError(mapError(ex instanceof Error ? ex.message : ""));
    } finally {
      setBusy(false);
    }
  }

  const submitLabel = { login: "auth.signIn", signup: "auth.signUp", forgot: "auth.sendReset", reset: "auth.setPassword" }[mode] as Key;
  const q = next ? `?next=${encodeURIComponent(next)}` : "";
  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {mode === "signup" && (
        <div>
          <label htmlFor="name" className="label">{t("auth.fullName")}</label>
          <input id="name" className="input" autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} />
        </div>
      )}
      {mode !== "reset" && (
        <div>
          <label htmlFor="email" className="label">{t("auth.email")}</label>
          <input id="email" type="email" inputMode="email" autoComplete="email" className="input" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
      )}
      {mode !== "forgot" && (
        <div>
          <label htmlFor="password" className="label">{mode === "reset" ? t("auth.newPassword") : t("auth.password")}</label>
          <input
            id="password" type="password" className="input" required minLength={8}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            value={password} onChange={(e) => setPassword(e.target.value)} aria-describedby="pw-hint"
          />
          {mode !== "login" && <p id="pw-hint" className="hint">{t("auth.passwordHint")}</p>}
        </div>
      )}
      {error && <p role="alert" className="field-error">{t(error)}</p>}
      {info && <p role="status" className="rounded-xl border-2 border-field-700 bg-field-50 p-3 font-semibold">{t(info)}</p>}
      <button type="submit" disabled={busy} className="btn btn-green w-full">{busy ? t("common.loading") : t(submitLabel)}</button>
      <div className="flex flex-col gap-1 text-center">
        {mode === "login" && (
          <>
            <Link className="inline-flex min-h-touch items-center justify-center font-semibold text-field-800 underline" href="/forgot">{t("auth.forgot")}</Link>
            <Link className="inline-flex min-h-touch items-center justify-center font-semibold text-field-800 underline" href={`/signup${q}`}>{t("auth.noAccount")}</Link>
          </>
        )}
        {(mode === "signup" || mode === "forgot") && (
          <Link className="inline-flex min-h-touch items-center justify-center font-semibold text-field-800 underline" href={`/login${q}`}>{t("auth.haveAccount")}</Link>
        )}
      </div>
    </form>
  );
}
