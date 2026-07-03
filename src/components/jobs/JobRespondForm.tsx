"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useT } from "@/components/I18nProvider";

export default function JobRespondForm({ jobId }: { jobId: string }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const t = useT().jobs;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch(`/api/jobs/${jobId}/responses`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: message.trim() }),
    });
    setLoading(false);
    if (res.ok) {
      router.refresh();
    } else {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? t.respondError);
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn-secondary mt-3">
        {t.respond}
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="mt-3">
      <textarea
        className="input min-h-20 resize-y"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder={t.respondPh}
        required
        minLength={10}
        maxLength={1000}
      />
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <button type="submit" disabled={loading} className="btn-primary mt-2">
        {loading ? t.sending : t.sendResponse}
      </button>
    </form>
  );
}
