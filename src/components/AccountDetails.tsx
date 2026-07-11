"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useT } from "@/components/I18nProvider";
import { useToast } from "@/components/ToastProvider";
import { Field } from "@/components/ui/Field";

// Account self-service (#396): edit name/phone and start a change-email flow.
// Backed by identity-service via the gateway (PUT /api/account/profile,
// POST /api/account/email/change). Both submits use try/finally so a dropped
// network never wedges the button.
export default function AccountDetails({
  initial,
}: {
  initial: {
    name: string;
    phone: string | null;
    email: string;
    emailVerified: boolean;
  };
}) {
  const t = useT().account;
  const toast = useToast();
  const router = useRouter();

  // Profile
  const [name, setName] = useState(initial.name);
  const [phone, setPhone] = useState(initial.phone ?? "");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState("");

  // Change email
  const [newEmail, setNewEmail] = useState("");
  const [changingEmail, setChangingEmail] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [sentTo, setSentTo] = useState("");

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setProfileError("");
    setSavingProfile(true);
    try {
      const res = await fetch("/api/account/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone }),
      });
      if (res.ok) {
        toast.success(t.profileSaved);
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setProfileError(data.error ?? t.genericError);
      }
    } catch {
      setProfileError(t.genericError);
    } finally {
      setSavingProfile(false);
    }
  }

  async function changeEmail(e: React.FormEvent) {
    e.preventDefault();
    setEmailError("");
    setSentTo("");
    setChangingEmail(true);
    try {
      const res = await fetch("/api/account/email/change", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: newEmail }),
      });
      if (res.ok) {
        setSentTo(newEmail);
        setNewEmail("");
      } else {
        const data = await res.json().catch(() => ({}));
        setEmailError(data.error ?? t.genericError);
      }
    } catch {
      setEmailError(t.genericError);
    } finally {
      setChangingEmail(false);
    }
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {/* -- Profile -------------------------------------------------- */}
      <form
        onSubmit={saveProfile}
        className="tech-corners overflow-hidden rounded-lg border border-ink-300 bg-surface"
      >
        <div className="flex items-center justify-between border-b border-ink-200 bg-ink-100 px-5 py-3 font-mono text-[11px] uppercase tracking-[0.12em]">
          <span className="font-bold text-ink-700">01</span>
          <span className="text-brand-700">{t.profileTitle}</span>
        </div>
        <div className="space-y-4 p-6">
          <Field label={t.nameLabel} htmlFor="account-name">
            <input
              id="account-name"
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              minLength={2}
              maxLength={80}
              autoComplete="name"
            />
          </Field>
          <Field label={t.phoneLabel} htmlFor="account-phone">
            <input
              id="account-phone"
              className="input"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              autoComplete="tel"
              aria-invalid={profileError ? true : undefined}
              aria-describedby={profileError ? "account-profile-error" : undefined}
            />
          </Field>
          {profileError && (
            <p id="account-profile-error" role="alert" className="text-sm text-red-600">
              {profileError}
            </p>
          )}
          <button type="submit" disabled={savingProfile} className="btn-primary">
            {savingProfile ? t.savingProfile : t.saveProfile}
          </button>
        </div>
      </form>

      {/* -- Change email --------------------------------------------- */}
      <form
        onSubmit={changeEmail}
        className="tech-corners overflow-hidden rounded-lg border border-ink-300 bg-surface"
      >
        <div className="flex items-center justify-between border-b border-ink-200 bg-ink-100 px-5 py-3 font-mono text-[11px] uppercase tracking-[0.12em]">
          <span className="font-bold text-ink-700">02</span>
          <span className="text-brand-700">{t.emailTitle}</span>
        </div>
        <div className="space-y-4 p-6">
          <div>
            <span className="label">{t.emailCurrent}</span>
            <div className="mt-1 flex items-center gap-2">
              <span className="font-medium text-ink-800">{initial.email}</span>
              <span
                className={`chip ring-1 ${
                  initial.emailVerified
                    ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                    : "bg-amber-50 text-amber-700 ring-amber-200"
                }`}
              >
                {initial.emailVerified ? t.emailVerifiedTag : t.emailUnverifiedTag}
              </span>
            </div>
          </div>
          <Field label={t.emailNew} htmlFor="account-new-email">
            <input
              id="account-new-email"
              className="input"
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              required
              autoComplete="email"
              aria-invalid={emailError ? true : undefined}
              aria-describedby={emailError ? "account-email-error" : undefined}
            />
          </Field>
          {emailError && (
            <p id="account-email-error" role="alert" className="text-sm text-red-600">
              {emailError}
            </p>
          )}
          {sentTo && (
            <p role="status" className="text-sm text-emerald-700">
              {t.emailChangeSent(sentTo)}
            </p>
          )}
          <button
            type="submit"
            disabled={changingEmail || newEmail.length === 0}
            className="btn-secondary"
          >
            {changingEmail ? t.changingEmail : t.changeEmail}
          </button>
        </div>
      </form>
    </div>
  );
}
