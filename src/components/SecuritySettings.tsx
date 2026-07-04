"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useT } from "@/components/I18nProvider";

// Account security controls, backed by identity-service via the gateway:
// change-password re-issues this session's cookie (other devices drop via the
// session-version bump), logout-all does the same without a password change,
// and delete-account erases across every service after re-authentication.
export default function SecuritySettings() {
  const t = useT();
  const router = useRouter();

  // Change password
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [changing, setChanging] = useState(false);
  const [changeMsg, setChangeMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Sign out everywhere
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutMsg, setLogoutMsg] = useState("");

  // Delete account
  const [deletePassword, setDeletePassword] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setChangeMsg(null);
    if (next !== confirm) {
      setChangeMsg({ ok: false, text: t.security.mismatch });
      return;
    }
    setChanging(true);
    const res = await fetch("/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: current, newPassword: next }),
    });
    setChanging(false);
    if (res.ok) {
      setCurrent("");
      setNext("");
      setConfirm("");
      setChangeMsg({ ok: true, text: t.security.changed });
    } else {
      const data = await res.json().catch(() => ({}));
      setChangeMsg({ ok: false, text: data.error ?? t.security.genericError });
    }
  }

  async function logoutAll() {
    setLoggingOut(true);
    setLogoutMsg("");
    const res = await fetch("/api/auth/logout-all", { method: "POST" });
    setLoggingOut(false);
    if (res.ok) {
      setLogoutMsg(t.security.logoutAllDone);
    } else {
      const data = await res.json().catch(() => ({}));
      setLogoutMsg(data.error ?? t.security.genericError);
    }
  }

  async function deleteAccount(e: React.FormEvent) {
    e.preventDefault();
    setDeleting(true);
    setDeleteError("");
    const res = await fetch("/api/auth/delete-account", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: deletePassword }),
    });
    if (res.ok) {
      router.push("/");
      router.refresh();
      return;
    }
    setDeleting(false);
    const data = await res.json().catch(() => ({}));
    setDeleteError(data.error ?? t.security.genericError);
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight text-ink-900">
        {t.security.title}
      </h1>
      <p className="mt-1 text-ink-600">{t.security.subtitle}</p>

      <form onSubmit={changePassword} className="card mt-8 space-y-4 p-6">
        <h2 className="text-lg font-semibold text-ink-900">
          {t.security.changeTitle}
        </h2>
        <div>
          <label className="label">{t.security.current}</label>
          <input
            className="input"
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            required
            autoComplete="current-password"
          />
        </div>
        <div>
          <label className="label">{t.security.newPassword}</label>
          <input
            className="input"
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            required
            minLength={6}
            maxLength={100}
            autoComplete="new-password"
          />
        </div>
        <div>
          <label className="label">{t.security.confirm}</label>
          <input
            className="input"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={6}
            maxLength={100}
            autoComplete="new-password"
          />
        </div>
        {changeMsg && (
          <p className={`text-sm ${changeMsg.ok ? "text-green-700" : "text-red-600"}`}>
            {changeMsg.text}
          </p>
        )}
        <button type="submit" disabled={changing} className="btn-primary">
          {changing ? t.security.changing : t.security.change}
        </button>
      </form>

      <div className="card mt-6 p-6">
        <h2 className="text-lg font-semibold text-ink-900">
          {t.security.logoutAllTitle}
        </h2>
        <p className="mt-1 text-sm text-ink-500">{t.security.logoutAllBody}</p>
        {logoutMsg && <p className="mt-3 text-sm text-green-700">{logoutMsg}</p>}
        <button
          type="button"
          onClick={logoutAll}
          disabled={loggingOut}
          className="btn-secondary mt-4"
        >
          {t.security.logoutAll}
        </button>
      </div>

      <form
        onSubmit={deleteAccount}
        className="card mt-6 border-red-200 p-6"
      >
        <h2 className="text-lg font-semibold text-red-700">
          {t.security.deleteTitle}
        </h2>
        <p className="mt-1 text-sm text-ink-500">{t.security.deleteBody}</p>
        <div className="mt-4">
          <label className="label">{t.security.deletePassword}</label>
          <input
            className="input"
            type="password"
            value={deletePassword}
            onChange={(e) => setDeletePassword(e.target.value)}
            required
            autoComplete="current-password"
          />
        </div>
        {deleteError && <p className="mt-3 text-sm text-red-600">{deleteError}</p>}
        <button
          type="submit"
          disabled={deleting || deletePassword.length === 0}
          className="mt-4 rounded-full bg-red-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
        >
          {deleting ? t.security.deleting : t.security.delete}
        </button>
      </form>
    </div>
  );
}
