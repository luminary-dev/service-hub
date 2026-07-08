"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useLocale, useT } from "@/components/I18nProvider";
import { localizedHref } from "@/lib/links";
import PasswordInput from "@/components/PasswordInput";
import { Field } from "@/components/ui/Field";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const t = useT();
  const locale = useLocale();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    setLoading(false);
    if (res.ok) {
      const data = await res.json();
      router.push(
        localizedHref(
          data.user.role === "PROVIDER" ? "/dashboard" : "/providers",
          locale,
        ),
      );
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? t.login.failed);
    }
  }

  return (
    <div className="blueprint-grid">
      <div className="mx-auto flex max-w-md flex-col px-4 py-16 sm:px-6">
        <div className="flex items-center gap-2.5 font-mono text-[11px] font-semibold uppercase tracking-[0.14em]">
          <span className="rounded-sm bg-brand-700 px-1.5 py-0.5 text-white dark:text-ink-50">
            AUTH
          </span>
          <span className="text-ink-500">SIGN-IN</span>
        </div>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-ink-900">
          {t.login.title}
        </h1>
        <p className="mt-2 text-sm text-ink-600">{t.login.sub}</p>

        <div className="tech-corners mt-8 overflow-hidden rounded-lg border border-ink-300 bg-surface">
          <div className="flex items-center justify-between border-b border-ink-200 bg-ink-100 px-5 py-3 font-mono text-[11px] uppercase tracking-[0.12em]">
            <span className="font-bold tabular-nums text-ink-700">AUTH-01</span>
            <span className="flex items-center gap-2 text-brand-700">
              <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-brand-600" />
              SESSION
            </span>
          </div>
          <form onSubmit={submit} className="space-y-4 p-6">
            <Field label={t.login.email} htmlFor="login-email">
              <input
                id="login-email"
                className="input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </Field>
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="label mb-0" htmlFor="login-password">
                  {t.login.password}
                </label>
                <Link
                  href={localizedHref("/forgot-password", locale)}
                  className="text-xs font-medium text-brand-600 hover:text-brand-700"
                >
                  {t.login.forgot}
                </Link>
              </div>
              <PasswordInput
                id="login-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                aria-describedby={error ? "login-error" : undefined}
              />
            </div>
            {error && (
              <p id="login-error" role="alert" className="text-sm text-red-600">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full"
            >
              {loading ? t.login.signingIn : t.login.signIn}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-sm text-ink-500">
          {t.login.newTo}{" "}
          <Link
            href={localizedHref("/register", locale)}
            className="font-semibold text-brand-600 hover:text-brand-700"
          >
            {t.login.create}
          </Link>
        </p>
      </div>
    </div>
  );
}
