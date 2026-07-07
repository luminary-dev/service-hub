"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "../I18nProvider";

type Role = "CUSTOMER" | "PROVIDER" | "ADMIN";

export default function AdminUserActions({
  userId,
  role,
  locked,
}: {
  userId: string;
  role: Role;
  locked: boolean;
}) {
  const [pending, setPending] = useState(false);
  const t = useT().admin;
  const router = useRouter();

  async function patch(body: Record<string, unknown>) {
    setPending(true);
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    setPending(false);
    if (res && res.ok) router.refresh();
  }

  async function forceLogout() {
    setPending(true);
    const res = await fetch(`/api/admin/users/${userId}/force-logout`, {
      method: "POST",
    }).catch(() => null);
    setPending(false);
    if (res && res.ok) router.refresh();
  }

  const roleOptions: { value: Role; label: string }[] = [
    { value: "CUSTOMER", label: t.roleCustomer },
    { value: "PROVIDER", label: t.roleProvider },
    { value: "ADMIN", label: t.roleAdmin },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        aria-label={t.usersRole}
        value={role}
        disabled={pending}
        onChange={(e) => patch({ role: e.target.value })}
        className="cursor-pointer rounded-full border border-ink-300 bg-surface px-3 py-1.5 text-xs font-semibold text-ink-800 outline-none transition hover:border-brand-400 disabled:opacity-60"
      >
        {roleOptions.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </select>
      <button
        onClick={() => patch({ action: locked ? "unlock" : "lock" })}
        disabled={pending}
        className={`cursor-pointer rounded-full border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-60 ${
          locked
            ? "border-emerald-300 bg-surface text-emerald-700 hover:bg-emerald-50"
            : "border-red-300 bg-surface text-red-600 hover:bg-red-50"
        }`}
      >
        {locked ? t.unlock : t.lock}
      </button>
      <button
        onClick={forceLogout}
        disabled={pending}
        className="cursor-pointer rounded-full border border-ink-300 bg-surface px-3 py-1.5 text-xs font-semibold text-ink-800 transition hover:border-brand-400 hover:text-brand-700 disabled:opacity-60"
      >
        {t.forceLogout}
      </button>
    </div>
  );
}
