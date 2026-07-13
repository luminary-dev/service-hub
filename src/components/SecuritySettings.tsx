"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useT } from "@/components/I18nProvider";
import PasswordInput from "@/components/PasswordInput";
import { useToast } from "@/components/ToastProvider";
import { Field } from "@/components/ui/Field";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/lib/constants";

// Account security controls, backed by identity-service via the gateway:
// change-password re-issues this session's cookie (other devices drop via the
// session-version bump), logout-all does the same without a password change,
// and delete-account erases across every service after re-authentication.
export default function SecuritySettings() {
  const t = useT();
  const toast = useToast();
  const router = useRouter();

  // Change password
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [changing, setChanging] = useState(false);
  const [changeError, setChangeError] = useState("");

  // Sign out everywhere
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");

  // Delete account
  const [deletePassword, setDeletePassword] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setChangeError("");
    if (next !== confirm) {
      setChangeError(t.security.mismatch);
      return;
    }
    setChanging(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      if (res.ok) {
        setCurrent("");
        setNext("");
        setConfirm("");
        toast.success(t.security.changed);
      } else {
        const data = await res.json().catch(() => ({}));
        setChangeError(data.error ?? t.security.genericError);
      }
    } catch {
      // Network failure — recover instead of wedging the button (#363).
      setChangeError(t.security.genericError);
    } finally {
      setChanging(false);
    }
  }

  async function logoutAll() {
    setLoggingOut(true);
    setLogoutError("");
    try {
      const res = await fetch("/api/auth/logout-all", { method: "POST" });
      if (res.ok) {
        toast.success(t.security.logoutAllDone);
      } else {
        const data = await res.json().catch(() => ({}));
        setLogoutError(data.error ?? t.security.genericError);
      }
    } catch {
      setLogoutError(t.security.genericError);
    } finally {
      setLoggingOut(false);
    }
  }

  async function deleteAccount(e: React.FormEvent) {
    e.preventDefault();
    setDeleting(true);
    setDeleteError("");
    try {
      const res = await fetch("/api/auth/delete-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: deletePassword }),
      });
      if (res.ok) {
        // Keep the button disabled while we navigate away.
        router.push("/");
        router.refresh();
        return;
      }
      const data = await res.json().catch(() => ({}));
      setDeleteError(data.error ?? t.security.genericError);
    } catch {
      setDeleteError(t.security.genericError);
    }
    setDeleting(false);
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      {/* Spec kicker mirroring the registry surfaces. */}
      <div className="flex items-center gap-2.5 font-mono text-[11px] font-semibold uppercase tracking-[0.14em]">
        <span className="rounded-sm bg-brand-700 px-1.5 py-0.5 text-white dark:text-ink-50">
          SEC
        </span>
        <span className="hidden h-px flex-1 bg-ink-300 sm:block" />
      </div>
      <h1 className="mt-3 text-3xl font-bold tracking-tight text-ink-900 sm:text-4xl">
        {t.security.title}
      </h1>
      <p className="mt-2 text-ink-600">{t.security.subtitle}</p>

      {/* -- Change password ------------------------------------------ */}
      <form
        onSubmit={changePassword}
        className="tech-corners mt-8 overflow-hidden rounded-lg border border-ink-300 bg-surface"
      >
        <div className="flex items-center justify-between border-b border-ink-200 bg-ink-100 px-5 py-3 font-mono text-[11px] uppercase tracking-[0.12em]">
          <span className="font-bold text-ink-700">01</span>
          <span className="text-brand-700">{t.security.changeTitle}</span>
        </div>
        <div className="space-y-4 p-6">
          <Field label={t.security.current} htmlFor="current-password">
            <PasswordInput
              id="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              required
              autoComplete="current-password"
            />
          </Field>
          <Field label={t.security.newPassword} htmlFor="new-password">
            <PasswordInput
              id="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              required
              minLength={PASSWORD_MIN_LENGTH}
              maxLength={PASSWORD_MAX_LENGTH}
              autoComplete="new-password"
            />
          </Field>
          <Field label={t.security.confirm} htmlFor="confirm-password">
            <PasswordInput
              id="confirm-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={PASSWORD_MIN_LENGTH}
              maxLength={PASSWORD_MAX_LENGTH}
              autoComplete="new-password"
              aria-invalid={changeError ? true : undefined}
              aria-describedby={
                changeError ? "change-password-error" : undefined
              }
            />
          </Field>
          {changeError && (
            <p
              id="change-password-error"
              role="alert"
              className="text-sm text-red-600"
            >
              {changeError}
            </p>
          )}
          <button type="submit" disabled={changing} className="btn-primary">
            {changing ? t.security.changing : t.security.change}
          </button>
        </div>
      </form>

      {/* -- Sign out everywhere -------------------------------------- */}
      <div className="tech-corners mt-6 overflow-hidden rounded-lg border border-ink-300 bg-surface">
        <div className="flex items-center justify-between border-b border-ink-200 bg-ink-100 px-5 py-3 font-mono text-[11px] uppercase tracking-[0.12em]">
          <span className="font-bold text-ink-700">02</span>
          <span className="text-brand-700">{t.security.logoutAllTitle}</span>
        </div>
        <div className="p-6">
          <p className="text-sm text-ink-500">{t.security.logoutAllBody}</p>
          {logoutError && (
            <p role="alert" className="mt-3 text-sm text-red-600">
              {logoutError}
            </p>
          )}
          <button
            type="button"
            onClick={logoutAll}
            disabled={loggingOut}
            className="btn-secondary mt-4"
          >
            {t.security.logoutAll}
          </button>
        </div>
      </div>

      {/* -- Delete account (danger zone) ----------------------------- */}
      <form
        onSubmit={deleteAccount}
        className="tech-corners mt-6 overflow-hidden rounded-lg border border-red-300 bg-surface"
      >
        <div className="hazard h-1.5 w-full" />
        <div className="flex items-center justify-between border-b border-red-200 bg-red-50 px-5 py-3 font-mono text-[11px] uppercase tracking-[0.12em] dark:bg-red-950/30">
          <span className="font-bold text-red-700">03</span>
          <span className="text-red-700">{t.security.deleteTitle}</span>
        </div>
        <div className="p-6">
          <p className="text-sm text-ink-500">{t.security.deleteBody}</p>
          <div className="mt-4">
            <Field label={t.security.deletePassword} htmlFor="delete-password">
              <PasswordInput
                id="delete-password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                required
                autoComplete="current-password"
                aria-describedby={
                  deleteError ? "delete-account-error" : undefined
                }
              />
            </Field>
          </div>
          {deleteError && (
            <p
              id="delete-account-error"
              role="alert"
              className="mt-3 text-sm text-red-600"
            >
              {deleteError}
            </p>
          )}
          <button
            type="submit"
            disabled={deleting || deletePassword.length === 0}
            className="mt-4 inline-flex items-center justify-center gap-2 rounded-md bg-red-600 px-5 py-2.5 font-display text-sm font-semibold text-white transition hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-2 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-red-600/85"
          >
            {deleting ? t.security.deleting : t.security.delete}
          </button>
        </div>
      </form>
    </div>
  );
}
