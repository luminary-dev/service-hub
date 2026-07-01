"use client";

import { useState } from "react";
import { FaCircleCheck, FaRegPaperPlane } from "react-icons/fa6";

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
      setError(data.error ?? "Something went wrong. Please try again.");
    }
  }

  if (sent) {
    return (
      <div className="card flex flex-col items-center p-6 text-center">
        <FaCircleCheck className="h-10 w-10 text-emerald-500" />
        <h3 className="mt-3 font-semibold text-ink-900">Inquiry sent!</h3>
        <p className="mt-1 text-sm text-ink-500">
          {providerName} will get back to you soon. For urgent work, call them
          directly.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="card p-6">
      <h3 className="font-semibold text-ink-900">
        Send an inquiry to {providerName.split(" ")[0]}
      </h3>
      <p className="mt-1 text-xs text-ink-500">
        Free, no account required. They&apos;ll contact you back.
      </p>

      <div className="mt-4 space-y-3">
        <div>
          <label className="label">Your name</label>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            minLength={2}
          />
        </div>
        <div>
          <label className="label">Phone number</label>
          <input
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
          <label className="label">
            Email <span className="text-ink-500">(optional)</span>
          </label>
          <input
            className="input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <label className="label">What do you need done?</label>
          <textarea
            className="input min-h-28 resize-y"
            placeholder="Describe the job, location and when you need it…"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            required
            minLength={10}
          />
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <button type="submit" disabled={loading} className="btn-primary mt-4 w-full">
        <FaRegPaperPlane className="h-3.5 w-3.5" />
        {loading ? "Sending…" : "Send Inquiry"}
      </button>
    </form>
  );
}
