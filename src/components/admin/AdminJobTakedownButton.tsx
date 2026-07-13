"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FaCircleCheck, FaTrash } from "@/components/icons";
import { hasFullAdminAccess } from "@/lib/roles";
import { useT } from "../I18nProvider";
import { useToast } from "../ToastProvider";

// Take down / restore a reported job (#376): PATCHes job-service's admin
// endpoint with { action: "hide" | "unhide" }. The takedown is a reversible
// soft-hide (the job vanishes from the provider board and stops accepting
// responses) but it is still destructive, so it's a full-ADMIN action (#226) —
// SUPPORT users see a disabled control, matching AdminDeleteButton.
export default function AdminJobTakedownButton({
  jobId,
  hidden,
  role,
}: {
  jobId: string;
  hidden: boolean;
  role: string;
}) {
  const [pending, setPending] = useState(false);
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const allowed = hasFullAdminAccess(role);

  async function act() {
    if (!allowed) return;
    setPending(true);
    const res = await fetch(`/api/admin/jobs/${encodeURIComponent(jobId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: hidden ? "unhide" : "hide" }),
    }).catch(() => null);
    setPending(false);
    if (res && res.ok) {
      toast.success(hidden ? t.toast.adminJobRestored : t.toast.adminJobHidden);
      router.refresh();
    } else {
      toast.error(hidden ? t.toast.adminJobRestoreError : t.toast.adminJobHideError);
    }
  }

  const label = hidden ? t.admin.jobUnhide : t.admin.jobHide;
  return (
    <button
      onClick={act}
      disabled={pending || !allowed}
      aria-label={allowed ? label : t.admin.insufficientPermissions}
      title={allowed ? undefined : t.admin.insufficientPermissions}
      className={
        hidden
          ? "inline-flex cursor-pointer items-center gap-1.5 rounded-sm border border-emerald-200 bg-surface px-2.5 py-1 font-mono text-[11px] font-semibold uppercase tracking-wider text-emerald-700 transition-[border-color,color,background-color] duration-200 ease-snap hover:border-emerald-300 hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60"
          : "inline-flex cursor-pointer items-center gap-1.5 rounded-sm border border-red-200 bg-surface px-2.5 py-1 font-mono text-[11px] font-semibold uppercase tracking-wider text-red-600 transition-[border-color,color,background-color] duration-200 ease-snap hover:border-red-300 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60"
      }
    >
      {hidden ? <FaCircleCheck className="h-3 w-3" /> : <FaTrash className="h-3 w-3" />}
      {label}
    </button>
  );
}
