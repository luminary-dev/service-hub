"use client";

import Link from "next/link";
import { useState } from "react";
import { FaCircleCheck } from "@/components/icons";
import { useLocale, useT } from "@/components/I18nProvider";
import { localizedHref } from "@/lib/links";
import { Field } from "@/components/ui/Field";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const t = useT();
  const locale = useLocale();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    }).catch(() => {});
    setLoading(false);
    setSent(true);
  }

  if (sent) {
    return (
      <div className="blueprint-grid">
        <div className="mx-auto flex max-w-md flex-col px-4 py-16 sm:px-6">
          <div className="tech-corners card flex flex-col items-center border-ink-300 p-8 text-center">
            <FaCircleCheck className="h-10 w-10 text-emerald-500" />
            <h1 className="mt-4 text-xl font-semibold text-ink-900">
              {t.forgot.sentTitle}
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-ink-600">
              {t.forgot.sentBody}
            </p>
            <Link href={localizedHref("/login", locale)} className="btn-secondary mt-6">
              {t.forgot.backToLogin}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="blueprint-grid">
      <div className="mx-auto flex max-w-md flex-col px-4 py-16 sm:px-6">
        <div className="flex items-center gap-2.5 font-mono text-[11px] font-semibold uppercase tracking-[0.14em]">
          <span className="rounded-sm bg-brand-700 px-1.5 py-0.5 text-white dark:text-ink-50">
            AUTH
          </span>
          <span className="text-ink-500">RECOVERY</span>
        </div>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-ink-900">
          {t.forgot.title}
        </h1>
        <p className="mt-2 text-sm text-ink-600">{t.forgot.sub}</p>

        <div className="tech-corners mt-8 overflow-hidden rounded-lg border border-ink-300 bg-surface">
          <div className="flex items-center justify-between border-b border-ink-200 bg-ink-100 px-5 py-3 font-mono text-[11px] uppercase tracking-[0.12em]">
            <span className="font-bold tabular-nums text-ink-700">PWD-01</span>
            <span className="text-brand-700">REQUEST</span>
          </div>
          <form onSubmit={submit} className="space-y-4 p-6">
            <Field label={t.forgot.email} htmlFor="forgot-email">
              <input
                id="forgot-email"
                className="input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </Field>
            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full"
            >
              {loading ? t.forgot.sending : t.forgot.send}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-sm text-ink-500">
          <Link
            href={localizedHref("/login", locale)}
            className="font-semibold text-brand-600 hover:text-brand-700"
          >
            {t.forgot.backToLogin}
          </Link>
        </p>
      </div>
    </div>
  );
}
