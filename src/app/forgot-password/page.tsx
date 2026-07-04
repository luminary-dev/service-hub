"use client";

import Link from "next/link";
import { useState } from "react";
import { FaCircleCheck } from "react-icons/fa6";
import { useT } from "@/components/I18nProvider";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const t = useT();

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
      <div className="mx-auto flex max-w-md flex-col px-4 py-16 sm:px-6">
        <div className="card flex flex-col items-center p-8 text-center">
          <FaCircleCheck className="h-10 w-10 text-emerald-500" />
          <h1 className="mt-4 text-xl font-semibold text-ink-900">
            {t.forgot.sentTitle}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-600">
            {t.forgot.sentBody}
          </p>
          <Link href="/login" className="btn-secondary mt-6">
            {t.forgot.backToLogin}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-md flex-col px-4 py-16 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight text-ink-900">
        {t.forgot.title}
      </h1>
      <p className="mt-1 text-sm text-ink-600">{t.forgot.sub}</p>

      <form onSubmit={submit} className="card mt-8 space-y-4 p-6">
        <div>
          <label className="label" htmlFor="forgot-email">
            {t.forgot.email}
          </label>
          <input
            id="forgot-email"
            className="input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </div>
        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading ? t.forgot.sending : t.forgot.send}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-ink-500">
        <Link
          href="/login"
          className="font-semibold text-brand-600 hover:text-brand-700"
        >
          {t.forgot.backToLogin}
        </Link>
      </p>
    </div>
  );
}
