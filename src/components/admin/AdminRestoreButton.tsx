"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FaCircleCheck } from "@/components/icons";
import { hasFullAdminAccess } from "@/lib/roles";
import { useT } from "../I18nProvider";
import { useToast } from "../ToastProvider";

// Undo the soft-delete (#32) of a work photo or review from the moderation
// views. Mirrors AdminDeleteButton (same pending/permission/toast pattern),
// but PATCHes the service's restore endpoint. Restore is destructive-adjacent
// (it re-publishes content), so it's a full-ADMIN action (#226) — SUPPORT
// users see a disabled control, matching AdminDeleteButton.
export default function AdminRestoreButton({
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
  const allowed = hasFullAdminAccess(role);

  async function restore() {
    if (!allowed) return;
    setPending(true);
    const res = await fetch(endpoint, { method: "PATCH" }).catch(() => null);
    setPending(false);
    if (res && res.ok) {
      toast.success(t.toast.adminRestored);
      router.refresh();
    } else {
      toast.error(t.toast.adminRestoreError);
    }
  }

  return (
    <button
      onClick={restore}
      disabled={pending || !allowed}
      aria-label={allowed ? t.admin.restore : t.admin.insufficientPermissions}
      title={allowed ? undefined : t.admin.insufficientPermissions}
      className="inline-flex cursor-pointer items-center gap-1.5 rounded-sm border border-emerald-200 bg-surface px-2.5 py-1 font-mono text-[11px] font-semibold uppercase tracking-wider text-emerald-700 transition-[border-color,color,background-color] duration-200 ease-snap hover:border-emerald-300 hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60"
    >
      <FaCircleCheck className="h-3 w-3" />
      {t.admin.restore}
    </button>
  );
}
