"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useT } from "@/components/I18nProvider";
import PasswordInput from "@/components/PasswordInput";
import { Field } from "@/components/ui/Field";
import {
  FormError,
  isValidEmail,
  useFieldErrors,
  type FieldErrors,
} from "@/components/ui/FormError";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/lib/constants";

export default function CustomerRegisterPage() {
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { fieldErrors, show } = useFieldErrors();
  const router = useRouter();
  const t = useT();

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function validate(): FieldErrors {
    const errs: FieldErrors = {};
    if (form.name.trim().length < 2) errs["reg-name"] = t.fieldErrors.name;
    if (!isValidEmail(form.email)) errs["reg-email"] = t.fieldErrors.email;
    if (form.phone.trim().length < 9) errs["reg-phone"] = t.fieldErrors.phone;
    if (form.password.length < PASSWORD_MIN_LENGTH)
      errs["reg-password"] = t.fieldErrors.passwordMin(PASSWORD_MIN_LENGTH);
    return errs;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (show(validate())) return;
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, role: "CUSTOMER" }),
      });
      if (res.ok) {
        router.push("/providers");
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? t.custReg.failed);
      }
    } catch {
      // Network failure — recover instead of wedging the button (#431).
      setError(t.custReg.failed);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="blueprint-grid">
      <div className="mx-auto flex max-w-md flex-col px-4 py-16 sm:px-6">
        <div className="flex items-center gap-2.5 font-mono text-[11px] font-semibold uppercase tracking-[0.14em]">
          <span className="rounded-sm bg-brand-700 px-1.5 py-0.5 text-white dark:text-ink-50">
            JOIN
          </span>
          <span className="text-ink-500">CUSTOMER</span>
        </div>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-ink-900">
          {t.custReg.title}
        </h1>
        <p className="mt-2 text-sm text-ink-600">{t.custReg.sub}</p>

        <div className="tech-corners mt-8 overflow-hidden rounded-lg border border-ink-300 bg-surface">
          <div className="flex items-center justify-between border-b border-ink-200 bg-ink-100 px-5 py-3 font-mono text-[11px] uppercase tracking-[0.12em]">
            <span className="font-bold tabular-nums text-ink-700">REG-C</span>
            <span className="text-brand-700">CUSTOMER</span>
          </div>
          {/* noValidate: validation happens in JS so errors are localized,
              inline and linked to their fields (#378), not browser bubbles. */}
          <form onSubmit={submit} noValidate className="space-y-4 p-6">
            <Field
              label={t.custReg.fullName}
              htmlFor="reg-name"
              error={fieldErrors["reg-name"]}
            >
              <input
                id="reg-name"
                className="input"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                required
                minLength={2}
              />
            </Field>
            <Field
              label={t.custReg.email}
              htmlFor="reg-email"
              error={fieldErrors["reg-email"]}
            >
              <input
                id="reg-email"
                className="input"
                type="email"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                required
                autoComplete="email"
              />
            </Field>
            <Field
              label={t.custReg.phone}
              htmlFor="reg-phone"
              error={fieldErrors["reg-phone"]}
            >
              <input
                id="reg-phone"
                className="input"
                type="tel"
                placeholder="07X XXX XXXX"
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
                required
                minLength={9}
              />
            </Field>
            <Field
              label={t.custReg.password}
              htmlFor="reg-password"
              help={t.custReg.passwordHint}
              error={fieldErrors["reg-password"]}
            >
              <PasswordInput
                id="reg-password"
                value={form.password}
                onChange={(e) => set("password", e.target.value)}
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
              {loading ? t.custReg.creating : t.custReg.create}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-sm text-ink-500">
          {t.custReg.offering}{" "}
          <Link
            href="/register/provider"
            className="font-semibold text-brand-600 hover:text-brand-700"
          >
            {t.custReg.joinPro}
          </Link>
        </p>
      </div>
    </div>
  );
}
