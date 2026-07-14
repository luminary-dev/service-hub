"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { hasFullAdminAccess } from "@/lib/roles";
import { useT } from "../I18nProvider";
import { useToast } from "../ToastProvider";

const ACTION_MESSAGES = {
  approve: { success: "adminVerificationApproved", error: "adminVerificationApproveError" },
  reject: { success: "adminVerificationRejected", error: "adminVerificationRejectError" },
} as const;

export default function VerificationActions({
  providerId,
  role,
}: {
  providerId: string;
  role: string;
}) {
  const [pending, setPending] = useState(false);
  const [showReason, setShowReason] = useState(false);
  const [reason, setReason] = useState("");
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  // Approve/reject are ADMIN-only in provider-service (isFullAdmin); SUPPORT
  // reads the queue but gets disabled controls, like the rest of the admin
  // surface (#629). See docs/AUTHZ.md.
  const allowed = hasFullAdminAccess(role);

  async function act(action: "approve" | "reject") {
    if (!allowed) return;
    setPending(true);
    const res = await fetch(`/api/admin/verifications/${providerId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        ...(action === "reject" && reason.trim() ? { reason: reason.trim() } : {}),
      }),
    }).catch(() => null);
    setPending(false);
    const messages = ACTION_MESSAGES[action];
    if (res && res.ok) {
      toast.success(t.toast[messages.success]);
      router.refresh();
    } else {
      toast.error(t.toast[messages.error]);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex gap-2">
        <button
          onClick={() => act("approve")}
          disabled={pending || !allowed}
          title={allowed ? undefined : t.admin.insufficientPermissions}
          className="btn-primary !px-4 !py-2"
        >
          {t.admin.approve}
        </button>
        <button
          onClick={() => (showReason ? act("reject") : setShowReason(true))}
          disabled={pending || !allowed}
          title={allowed ? undefined : t.admin.insufficientPermissions}
          className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-md border border-red-300 bg-surface px-4 py-2 font-display text-sm font-semibold text-red-600 transition-[border-color,background-color,transform] duration-200 ease-snap hover:border-red-400 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300 focus-visible:ring-offset-2 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {showReason ? t.admin.confirmReject : t.admin.reject}
        </button>
      </div>
      {showReason && (
        <div className="w-64">
          <textarea
            className="input"
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t.admin.rejectionReasonPlaceholder}
            autoFocus
          />
          <button
            onClick={() => {
              setShowReason(false);
              setReason("");
            }}
            className="btn-ghost mt-1 !px-2 !py-1 text-xs"
          >
            {t.admin.cancel}
          </button>
        </div>
      )}
    </div>
  );
}
