"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "../I18nProvider";
import { useToast } from "../ToastProvider";

type Role = "CUSTOMER" | "PROVIDER" | "ADMIN" | "SUPPORT";

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
  // The role select is staged locally and committed via the explicit Apply
  // button: a closed native select fires `change` on every arrow keypress, so
  // patching from onChange would grant/revoke ADMIN mid-keyboarding (WCAG
  // 3.2.2, same class as the FilterBar sort fix in #540).
  const [selectedRole, setSelectedRole] = useState<Role>(role);
  const t = useT();
  const toast = useToast();
  const router = useRouter();

  async function patch(
    body: Record<string, unknown>,
    messages: { success: string; error: string }
  ) {
    setPending(true);
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    setPending(false);
    if (res && res.ok) {
      toast.success(messages.success);
      router.refresh();
    } else {
      // Surface the server's message when it sends one (e.g. 400 "Cannot
      // modify your own account here"); fall back to the generic string.
      const data = res ? await res.json().catch(() => ({})) : {};
      toast.error(data.error ?? messages.error);
    }
  }

  async function forceLogout() {
    setPending(true);
    const res = await fetch(`/api/admin/users/${userId}/force-logout`, {
      method: "POST",
    }).catch(() => null);
    setPending(false);
    if (res && res.ok) {
      toast.success(t.toast.adminForceLogout);
      router.refresh();
    } else {
      const data = res ? await res.json().catch(() => ({})) : {};
      toast.error(data.error ?? t.toast.adminForceLogoutError);
    }
  }

  const roleOptions: { value: Role; label: string }[] = [
    { value: "CUSTOMER", label: t.admin.roleCustomer },
    { value: "PROVIDER", label: t.admin.roleProvider },
    { value: "ADMIN", label: t.admin.roleAdmin },
    { value: "SUPPORT", label: t.admin.roleSupport },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        aria-label={t.admin.usersRole}
        value={selectedRole}
        disabled={pending}
        onChange={(e) => setSelectedRole(e.target.value as Role)}
        className="cursor-pointer rounded-full border border-ink-300 bg-surface px-3 py-1.5 text-xs font-semibold text-ink-800 outline-none transition hover:border-brand-400 disabled:opacity-60"
      >
        {roleOptions.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </select>
      <button
        onClick={() =>
          patch(
            { role: selectedRole },
            {
              success: t.toast.adminRoleChanged,
              error: t.toast.adminRoleChangeError,
            }
          )
        }
        disabled={pending || selectedRole === role}
        className="cursor-pointer rounded-full border border-brand-400 bg-surface px-3 py-1.5 text-xs font-semibold text-brand-700 transition hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {t.admin.applyRole}
      </button>
      <button
        onClick={() =>
          patch(
            { action: locked ? "unlock" : "lock" },
            locked
              ? {
                  success: t.toast.adminUserUnlocked,
                  error: t.toast.adminUserUnlockError,
                }
              : {
                  success: t.toast.adminUserLocked,
                  error: t.toast.adminUserLockError,
                }
          )
        }
        disabled={pending}
        className={`cursor-pointer rounded-full border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-60 ${
          locked
            ? "border-emerald-300 bg-surface text-emerald-700 hover:bg-emerald-50"
            : "border-red-300 bg-surface text-red-600 hover:bg-red-50"
        }`}
      >
        {locked ? t.admin.unlock : t.admin.lock}
      </button>
      <button
        onClick={forceLogout}
        disabled={pending}
        className="cursor-pointer rounded-full border border-ink-300 bg-surface px-3 py-1.5 text-xs font-semibold text-ink-800 transition hover:border-brand-400 hover:text-brand-700 disabled:opacity-60"
      >
        {t.admin.forceLogout}
      </button>
    </div>
  );
}
