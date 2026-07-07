"use client";

import { useState } from "react";
import { FaCircleCheck, FaRegPaperPlane } from "@/components/icons";
import { useT } from "./I18nProvider";

export default function InquiryForm({
  providerId,
  providerName,
  defaultName,
}: {
  providerId: string;
  providerName: string;
  defaultName: string;
}) {
  const [name, setName] = useState(defaultName);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const t = useT();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch(`/api/providers/${providerId}/inquiries`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, phone, email, message }),
    });
    setLoading(false);
    if (res.ok) {
      setSent(true);
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? t.inquiry.error);
    }
  }

  if (sent) {
    return (
      <div className="tech-corners border border-ink-300 bg-surface">
        <div className="hazard h-2 w-full" />
        <div className="flex flex-col items-center p-6 text-center">
          <FaCircleCheck className="h-10 w-10 text-emerald-500" />
          <h3 className="mt-3 font-semibold text-ink-900">
            {t.inquiry.sentTitle}
          </h3>
          <p className="mt-1 text-sm text-ink-500">
            {t.inquiry.sentBody(providerName)}
          </p>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="tech-corners border border-ink-300 bg-surface"
    >
      <div className="hazard h-2 w-full" />
      <div className="p-6">
      <div className="flex items-center gap-2.5 font-mono text-[11px] font-semibold uppercase tracking-[0.14em]">
        <span className="rounded-sm bg-brand-700 px-1.5 py-0.5 text-white dark:text-ink-50">
          CTA
        </span>
        <span className="h-px flex-1 bg-ink-200" />
      </div>
      <h3 className="mt-3 text-lg font-semibold text-ink-900">
        {t.inquiry.title(providerName.split(" ")[0])}
      </h3>
      <p className="mt-1 text-xs text-ink-500">{t.inquiry.sub}</p>

      <div className="mt-4 space-y-3">
        <div>
          <label className="label" htmlFor="inquiry-name">
            {t.inquiry.name}
          </label>
          <input
            id="inquiry-name"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            minLength={2}
          />
        </div>
        <div>
          <label className="label" htmlFor="inquiry-phone">
            {t.inquiry.phone}
          </label>
          <input
            id="inquiry-phone"
            className="input"
            type="tel"
            placeholder="07X XXX XXXX"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
            minLength={9}
          />
        </div>
        <div>
          <label className="label" htmlFor="inquiry-email">
            {t.inquiry.email}{" "}
            <span className="text-ink-500">{t.inquiry.optional}</span>
          </label>
          <input
            id="inquiry-email"
            className="input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="inquiry-message">
            {t.inquiry.message}
          </label>
          <textarea
            id="inquiry-message"
            className="input min-h-28 resize-y"
            placeholder={t.inquiry.messagePh}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            required
            minLength={10}
          />
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-3 text-sm text-red-600">
          {error}
        </p>
      )}

      <button type="submit" disabled={loading} className="btn-primary mt-4 w-full">
        <FaRegPaperPlane className="h-3.5 w-3.5" />
        {loading ? t.inquiry.sending : t.inquiry.send}
      </button>
      </div>
    </form>
  );
}
