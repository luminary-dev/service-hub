"use client";

import { useRef, useState } from "react";
import { FaCircleCheck, FaRegPaperPlane } from "@/components/icons";
import EmailVerifyBanner from "./EmailVerifyBanner";
import FormSuccess from "./FormSuccess";
import { Field } from "./ui/Field";
import {
  FormError,
  isValidEmail,
  useFieldErrors,
  type FieldErrors,
} from "./ui/FormError";
import { useT } from "./I18nProvider";

export default function InquiryForm({
  providerId,
  providerName,
  defaultName,
  emailUnverified = false,
}: {
  providerId: string;
  providerName: string;
  defaultName: string;
  // Verified-email gate (#115): true only for a signed-in user who hasn't
  // confirmed their email. Anonymous visitors may still inquire, so this stays
  // false for them and the form behaves exactly as before.
  emailUnverified?: boolean;
}) {
  const [name, setName] = useState(defaultName);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  // Honeypot (#65): an uncontrolled decoy read straight off the DOM at submit,
  // so a bot that writes the field's value without firing React events is still
  // caught. The authoritative check is server-side; this only carries the value.
  const honeypotRef = useRef<HTMLInputElement>(null);
  const { fieldErrors, show } = useFieldErrors();
  const t = useT();

  function validate(): FieldErrors {
    const errs: FieldErrors = {};
    if (name.trim().length < 2) errs["inquiry-name"] = t.fieldErrors.name;
    if (phone.trim().length < 9) errs["inquiry-phone"] = t.fieldErrors.phone;
    if (email.trim() !== "" && !isValidEmail(email))
      errs["inquiry-email"] = t.fieldErrors.email;
    if (message.trim().length < 10)
      errs["inquiry-message"] = t.fieldErrors.messageMin(10);
    return errs;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (show(validate())) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/providers/${providerId}/inquiries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          phone,
          email,
          message,
          company: honeypotRef.current?.value ?? "",
        }),
      });
      if (res.ok) {
        setSent(true);
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? t.inquiry.error);
      }
    } catch {
      // Network failure — recover instead of wedging the button (#363).
      setError(t.inquiry.error);
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="tech-corners border border-ink-300 bg-surface">
        <div className="hazard h-2 w-full" />
        <FormSuccess
          title={t.inquiry.sentTitle}
          icon={<FaCircleCheck className="h-10 w-10 text-emerald-500" />}
          className="flex flex-col items-center p-6 text-center"
          headingClassName="mt-3 font-semibold text-ink-900 focus:outline-none"
        >
          <p className="mt-1 text-sm text-ink-500">
            {t.inquiry.sentBody(providerName)}
          </p>
        </FormSuccess>
      </div>
    );
  }

  return (
    // noValidate: validation happens in JS so errors are localized, inline
    // and linked to their fields (#378), not browser bubbles.
    <form
      onSubmit={submit}
      noValidate
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

      {/* Verified-email gate (#115): a clear prompt + resend affordance for a
          signed-in but unconfirmed user, instead of letting them submit into a
          backend 403. The submit button below is disabled while it shows. */}
      {emailUnverified && (
        <div className="mt-4">
          <EmailVerifyBanner message={t.verify.inquiryPrompt} />
        </div>
      )}

      {/*
        Honeypot decoy (#65). Hidden and inert for real users — moved off-screen
        (not display:none, which some bots skip), aria-hidden so screen readers
        ignore it, tabindex -1 so keyboard users never land on it, and
        autocomplete off so browsers never prefill it. Bots that fill every
        field trip the server-side check in provider-service. Not a visible form
        change; a security control, not a redesign.
      */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-[9999px] h-0 w-0 overflow-hidden"
      >
        <label htmlFor="inquiry-company">Company (leave this field blank)</label>
        <input
          id="inquiry-company"
          ref={honeypotRef}
          type="text"
          name="company"
          tabIndex={-1}
          autoComplete="off"
          defaultValue=""
        />
      </div>

      <div className="mt-4 space-y-3">
        <Field
          label={t.inquiry.name}
          htmlFor="inquiry-name"
          error={fieldErrors["inquiry-name"]}
        >
          <input
            id="inquiry-name"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            minLength={2}
          />
        </Field>
        <Field
          label={t.inquiry.phone}
          htmlFor="inquiry-phone"
          error={fieldErrors["inquiry-phone"]}
        >
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
        </Field>
        <Field
          label={
            <>
              {t.inquiry.email}{" "}
              <span className="text-ink-500">{t.inquiry.optional}</span>
            </>
          }
          htmlFor="inquiry-email"
          error={fieldErrors["inquiry-email"]}
        >
          <input
            id="inquiry-email"
            className="input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field
          label={t.inquiry.message}
          htmlFor="inquiry-message"
          error={fieldErrors["inquiry-message"]}
        >
          <textarea
            id="inquiry-message"
            className="input min-h-28 resize-y"
            placeholder={t.inquiry.messagePh}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            required
            minLength={10}
          />
        </Field>
      </div>

      <FormError className="mt-3">{error}</FormError>

      <button
        type="submit"
        disabled={loading || emailUnverified}
        className="btn-primary mt-4 w-full"
      >
        <FaRegPaperPlane className="h-3.5 w-3.5" />
        {loading ? t.inquiry.sending : t.inquiry.send}
      </button>
      </div>
    </form>
  );
}
