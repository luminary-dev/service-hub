"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { hasSuperAdminAccess } from "@/lib/roles";
import { useT } from "../I18nProvider";

export default function AdminProviderActions({
  providerId,
  verified,
  suspended,
  role,
}: {
  providerId: string;
  verified: boolean;
  suspended: boolean;
  role: string;
}) {
  const [pending, setPending] = useState(false);
  const t = useT().admin;
  const router = useRouter();
  // Verify/suspend affect a provider's public visibility — treated as a
  // SUPERADMIN-only action alongside delete and category edits (#226).
  // SUPPORT gets read access plus report resolve/dismiss only.
  const allowed = hasSuperAdminAccess(role);

  async function act(action: string) {
    if (!allowed) return;
    setPending(true);
    const res = await fetch(`/api/admin/providers/${providerId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    }).catch(() => null);
    setPending(false);
    if (res && res.ok) router.refresh();
  }

  return (
    <div className="flex flex-wrap gap-2">
      <button
        onClick={() => act(verified ? "unverify" : "verify")}
        disabled={pending || !allowed}
        title={allowed ? undefined : t.insufficientPermissions}
        className="cursor-pointer rounded-full border border-ink-300 bg-surface px-3 py-1.5 text-xs font-semibold text-ink-800 transition hover:border-brand-400 hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {verified ? t.unverify : t.verify}
      </button>
      <button
        onClick={() => act(suspended ? "unsuspend" : "suspend")}
        disabled={pending || !allowed}
        title={allowed ? undefined : t.insufficientPermissions}
        className={`cursor-pointer rounded-full border px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
          suspended
            ? "border-emerald-300 bg-surface text-emerald-700 hover:bg-emerald-50"
            : "border-red-300 bg-surface text-red-600 hover:bg-red-50"
        }`}
      >
        {suspended ? t.unsuspend : t.suspend}
      </button>
    </div>
  );
}
