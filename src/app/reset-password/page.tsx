"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { FaCircleCheck } from "react-icons/fa6";
import { useT } from "@/components/I18nProvider";

function ResetForm() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const t = useT();

  if (!token) {
    return <InvalidLink />;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
    setLoading(false);
    if (res.ok) {
      setDone(true);
    } else {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? t.reset.genericError);
    }
  }

  if (done) {
    return (
      <div className="card flex flex-col items-center p-8 text-center">
        <FaCircleCheck className="h-10 w-10 text-emerald-500" />
        <h1 className="mt-4 text-xl font-semibold text-ink-900">
          {t.reset.doneTitle}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-600">
          {t.reset.doneBody}
        </p>
        <Link href="/login" className="btn-primary mt-6">
          {t.reset.signIn}
        </Link>
      </div>
    );
  }

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight text-ink-900">
        {t.reset.title}
      </h1>
      <p className="mt-1 text-sm text-ink-600">{t.reset.sub}</p>

      <form onSubmit={submit} className="card mt-8 space-y-4 p-6">
        <div>
          <label className="label">{t.reset.password}</label>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            autoComplete="new-password"
          />
          <p className="mt-1 text-xs text-ink-500">{t.reset.passwordHint}</p>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading ? t.reset.submitting : t.reset.submit}
        </button>
      </form>
    </>
  );
}

function InvalidLink() {
  const t = useT();
  return (
    <div className="card flex flex-col items-center p-8 text-center">
      <h1 className="text-xl font-semibold text-ink-900">
        {t.reset.invalidTitle}
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-ink-600">
        {t.reset.invalidBody}
      </p>
      <Link href="/forgot-password" className="btn-primary mt-6">
        {t.reset.requestNew}
      </Link>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="mx-auto flex max-w-md flex-col px-4 py-16 sm:px-6">
      <Suspense>
        <ResetForm />
      </Suspense>
    </div>
  );
}
