"use client";

import { useId, useState } from "react";
import { FaCircleCheck } from "@/components/icons";
import FormSuccess from "@/components/FormSuccess";
import { FormError, useFieldErrors } from "@/components/ui/FormError";
import { useT } from "@/components/I18nProvider";

export default function JobRespondForm({ jobId }: { jobId: string }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const { fieldErrors, show, errorProps } = useFieldErrors();
  // Several respond forms can be open at once on the board, so the message
  // field id must be unique per instance for the error wiring (#378).
  const messageId = useId();
  const { jobs: t, fieldErrors: fe } = useT();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (
      show(
        message.trim().length < 10 ? { [messageId]: fe.messageMin(10) } : {},
      )
    )
      return;
    setLoading(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}/responses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: message.trim() }),
      });
      if (res.ok) {
        // Show an announced, focus-catching confirmation in place rather than
        // refreshing away to a static "Responded" chip: a plain refresh unmounts
        // this form, drops the focused submit button, and announces nothing (#510).
        setSent(true);
      } else {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? t.respondError);
      }
    } catch {
      // Network failure — recover instead of wedging the button (#363).
      setError(t.respondError);
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <FormSuccess
        title={t.responseSent}
        icon={<FaCircleCheck className="h-4 w-4 shrink-0 text-emerald-500" />}
        className="flex items-center gap-2 text-sm font-medium text-emerald-700"
        headingClassName="text-sm font-medium text-emerald-700 focus:outline-none"
      />
    );
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn-secondary">
        {t.respond}
      </button>
    );
  }

  return (
    // noValidate: validation happens in JS so the error is localized, inline
    // and linked to the field (#378), not a browser bubble.
    <form onSubmit={submit} noValidate className="space-y-2">
      <textarea
        id={messageId}
        className="input min-h-20 resize-y"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder={t.respondPh}
        aria-label={t.respondPh}
        required
        minLength={10}
        maxLength={1000}
        {...errorProps(messageId)}
      />
      {fieldErrors[messageId] && (
        <p
          id={`${messageId}-error`}
          role="alert"
          className="text-xs text-red-600"
        >
          {fieldErrors[messageId]}
        </p>
      )}
      <FormError>{error}</FormError>
      <button type="submit" disabled={loading} className="btn-primary">
        {loading ? t.sending : t.sendResponse}
      </button>
    </form>
  );
}
