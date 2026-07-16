"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { FaCircleCheck } from "@/components/icons";
import { useLocale, useT } from "@/components/I18nProvider";
import { localizedHref } from "@/lib/links";
import PasswordInput from "@/components/PasswordInput";
import { Field } from "@/components/ui/Field";
import { FormError, useFieldErrors } from "@/components/ui/FormError";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/lib/constants";

function ResetForm() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const { fieldErrors, show } = useFieldErrors();
  const t = useT();
  const locale = useLocale();

  if (!token) {
    return <InvalidLink />;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (
      show(
        password.length < PASSWORD_MIN_LENGTH
          ? {
              "reset-password": t.fieldErrors.passwordMin(PASSWORD_MIN_LENGTH),
            }
          : {},
      )
    )
      return;
    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      if (res.ok) {
        setDone(true);
      } else {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? t.reset.genericError);
      }
    } catch {
      // Network failure — recover instead of wedging the button (#431).
      setError(t.reset.genericError);
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="tech-corners card flex flex-col items-center border-ink-300 p-8 text-center">
        <FaCircleCheck className="h-10 w-10 text-emerald-500" />
        <h1 className="mt-4 text-xl font-semibold text-ink-900">
          {t.reset.doneTitle}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-600">
          {t.reset.doneBody}
        </p>
        <Link href={localizedHref("/login", locale)} className="btn-primary mt-6">
          {t.reset.signIn}
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center gap-2.5 font-mono text-[11px] font-semibold uppercase tracking-[0.14em]">
        <span className="rounded-sm bg-brand-700 px-1.5 py-0.5 text-white dark:text-ink-50">
          AUTH
        </span>
        <span className="text-ink-500">RECOVERY</span>
      </div>
      <h1 className="mt-3 text-3xl font-bold tracking-tight text-ink-900">
        {t.reset.title}
      </h1>
      <p className="mt-2 text-sm text-ink-600">{t.reset.sub}</p>

      <div className="tech-corners mt-8 overflow-hidden rounded-lg border border-ink-300 bg-surface">
        <div className="flex items-center justify-between border-b border-ink-200 bg-ink-100 px-5 py-3 font-mono text-[11px] uppercase tracking-[0.12em]">
          <span className="font-bold tabular-nums text-ink-700">PWD-02</span>
          <span className="text-brand-700">RESET</span>
        </div>
        {/* noValidate: validation happens in JS so the error is localized,
            inline and linked to the field (#378), not a browser bubble. */}
        <form onSubmit={submit} noValidate className="space-y-4 p-6">
          <Field
            label={t.reset.password}
            htmlFor="reset-password"
            help={t.reset.passwordHint}
            error={fieldErrors["reset-password"]}
          >
            <PasswordInput
              id="reset-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={PASSWORD_MIN_LENGTH}
              maxLength={PASSWORD_MAX_LENGTH}
              autoComplete="new-password"
            />
          </Field>
          <FormError>{error}</FormError>
          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full"
          >
            {loading ? t.reset.submitting : t.reset.submit}
          </button>
        </form>
      </div>
    </>
  );
}

function InvalidLink() {
  const t = useT();
  const locale = useLocale();
  return (
    <div className="tech-corners card flex flex-col items-center border-ink-300 p-8 text-center">
      <h1 className="text-xl font-semibold text-ink-900">
        {t.reset.invalidTitle}
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-ink-600">
        {t.reset.invalidBody}
      </p>
      <Link href={localizedHref("/forgot-password", locale)} className="btn-primary mt-6">
        {t.reset.requestNew}
      </Link>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="blueprint-grid">
      <div className="mx-auto flex max-w-md flex-col px-4 py-16 sm:px-6">
        <Suspense>
          <ResetForm />
        </Suspense>
      </div>
    </div>
  );
}
