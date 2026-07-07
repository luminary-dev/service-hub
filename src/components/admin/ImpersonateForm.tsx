"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "../I18nProvider";

// Minimal standalone entry point for admin impersonation ("view as", #234).
// This should be replaced by a "View as" button on the user detail page once
// #220 (admin user management) merges — kept as its own small page for now
// since that page doesn't exist on this branch yet.
export default function ImpersonateForm() {
  const t = useT().admin;
  const router = useRouter();
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || pending) return;

    setPending(true);
    setError("");
    const res = await fetch(
      `/api/admin/impersonate/${encodeURIComponent(trimmed)}`,
      { method: "POST" }
    ).catch(() => null);
    setPending(false);

    if (res && res.ok) {
      router.push("/");
      router.refresh();
      return;
    }
    const data = await res?.json().catch(() => ({}));
    setError(data?.error ?? t.impersonateError);
  }

  return (
    <form onSubmit={submit} className="card mt-8 space-y-4 p-6">
      <div>
        <label className="label" htmlFor="impersonate-input">
          {t.impersonateInputLabel}
        </label>
        <input
          id="impersonate-input"
          className="input"
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t.impersonateInputPlaceholder}
          aria-describedby={error ? "impersonate-error" : undefined}
          required
        />
      </div>
      {error && (
        <p id="impersonate-error" role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      <button type="submit" disabled={pending} className="btn-primary w-full">
        {pending ? t.impersonateSubmitting : t.impersonateSubmit}
      </button>
      <p className="text-xs text-ink-500">{t.impersonateExpiryNote}</p>
    </form>
  );
}
