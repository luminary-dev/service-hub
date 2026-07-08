"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { hasSupportAccess } from "@/lib/roles";
import { useT } from "../I18nProvider";
import { useToast } from "../ToastProvider";

const STATUS_MESSAGES = {
  RESOLVED: { success: "adminReportResolved", error: "adminReportResolveError" },
  DISMISSED: { success: "adminReportDismissed", error: "adminReportDismissError" },
} as const;

// Close out an abuse report (#50): PATCH the owning service's admin endpoint
// (provider-service /api/admin/reports/:id or review-service
// /api/admin/review-reports/:id — the caller passes the full path).
//
// Resolving/dismissing reports is explicitly part of the SUPPORT tier
// (#226) — gated with hasSupportAccess rather than hasFullAdminAccess so
// both ADMIN and SUPPORT can act here.
export default function ReportActions({
  endpoint,
  role,
}: {
  endpoint: string;
  role: string;
}) {
  const [pending, setPending] = useState(false);
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const allowed = hasSupportAccess(role);

  async function act(status: "RESOLVED" | "DISMISSED") {
    if (!allowed) return;
    setPending(true);
    const res = await fetch(endpoint, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    }).catch(() => null);
    setPending(false);
    const messages = STATUS_MESSAGES[status];
    if (res && res.ok) {
      toast.success(t.toast[messages.success]);
      router.refresh();
    } else {
      toast.error(t.toast[messages.error]);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <button
        onClick={() => act("RESOLVED")}
        disabled={pending || !allowed}
        title={allowed ? undefined : t.admin.insufficientPermissions}
        className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-md border border-emerald-300 bg-surface px-3 py-1.5 font-display text-xs font-semibold text-emerald-700 transition-[border-color,background-color,transform] duration-200 ease-snap hover:border-emerald-400 hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:ring-offset-2 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {t.admin.resolve}
      </button>
      <button
        onClick={() => act("DISMISSED")}
        disabled={pending || !allowed}
        title={allowed ? undefined : t.admin.insufficientPermissions}
        className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-md border border-ink-300 bg-surface px-3 py-1.5 font-display text-xs font-semibold text-ink-600 transition-[border-color,background-color,transform] duration-200 ease-snap hover:border-ink-400 hover:bg-ink-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-300 focus-visible:ring-offset-2 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {t.admin.dismissReport}
      </button>
    </div>
  );
}
