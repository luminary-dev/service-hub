"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "../I18nProvider";
import { useToast } from "../ToastProvider";

const ACTION_MESSAGES = {
  approve: { success: "adminVerificationApproved", error: "adminVerificationApproveError" },
  reject: { success: "adminVerificationRejected", error: "adminVerificationRejectError" },
} as const;

export default function VerificationActions({
  providerId,
}: {
  providerId: string;
}) {
  const [pending, setPending] = useState(false);
  const [showReason, setShowReason] = useState(false);
  const [reason, setReason] = useState("");
  const t = useT().admin;
  const router = useRouter();

  async function act(action: "approve" | "reject") {
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
          disabled={pending}
          className="btn-primary !px-4 !py-2"
        >
          {t.approve}
        </button>
        <button
          onClick={() => (showReason ? act("reject") : setShowReason(true))}
          disabled={pending}
          className="cursor-pointer rounded-full border border-ink-300 bg-surface px-4 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-60"
        >
          {showReason ? t.confirmReject : t.reject}
        </button>
      </div>
      {showReason && (
        <div className="w-64">
          <textarea
            className="input"
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t.rejectionReasonPlaceholder}
            autoFocus
          />
          <button
            onClick={() => {
              setShowReason(false);
              setReason("");
            }}
            className="btn-ghost mt-1 !px-2 !py-1 text-xs"
          >
            {t.cancel}
          </button>
        </div>
      )}
    </div>
  );
}
