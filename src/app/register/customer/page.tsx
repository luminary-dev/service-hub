"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useT } from "@/components/I18nProvider";

export default function CustomerRegisterPage() {
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const t = useT();

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, role: "CUSTOMER" }),
    });
    setLoading(false);
    if (res.ok) {
      router.push("/providers");
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? t.custReg.failed);
    }
  }

  return (
    <div className="mx-auto flex max-w-md flex-col px-4 py-16 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight text-ink-900">
        {t.custReg.title}
      </h1>
      <p className="mt-1 text-sm text-ink-500">{t.custReg.sub}</p>

      <form onSubmit={submit} className="card mt-8 space-y-4 p-6">
        <div>
          <label className="label" htmlFor="reg-name">
            {t.custReg.fullName}
          </label>
          <input
            id="reg-name"
            className="input"
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            required
            minLength={2}
          />
        </div>
        <div>
          <label className="label" htmlFor="reg-email">
            {t.custReg.email}
          </label>
          <input
            id="reg-email"
            className="input"
            type="email"
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
            required
            autoComplete="email"
          />
        </div>
        <div>
          <label className="label" htmlFor="reg-phone">
            {t.custReg.phone}
          </label>
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
        </div>
        <div>
          <label className="label" htmlFor="reg-password">
            {t.custReg.password}
          </label>
          <input
            id="reg-password"
            className="input"
            type="password"
            value={form.password}
            onChange={(e) => set("password", e.target.value)}
            required
            minLength={6}
            autoComplete="new-password"
            aria-describedby="reg-password-hint"
          />
          <p id="reg-password-hint" className="mt-1 text-xs text-ink-500">
            {t.custReg.passwordHint}
          </p>
        </div>
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading ? t.custReg.creating : t.custReg.create}
        </button>
      </form>

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
  );
}
