"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "../I18nProvider";
import { useToast } from "../ToastProvider";

const ACTION_MESSAGES = {
  verify: { success: "adminVerified", error: "adminVerifyError" },
  unverify: { success: "adminUnverified", error: "adminUnverifyError" },
  suspend: { success: "adminSuspended", error: "adminSuspendError" },
  unsuspend: { success: "adminUnsuspended", error: "adminUnsuspendError" },
} as const;

export default function AdminProviderActions({
  providerId,
  verified,
  suspended,
}: {
  providerId: string;
  verified: boolean;
  suspended: boolean;
}) {
  const [pending, setPending] = useState(false);
  const t = useT();
  const toast = useToast();
  const router = useRouter();

  async function act(action: keyof typeof ACTION_MESSAGES) {
    setPending(true);
    const res = await fetch(`/api/admin/providers/${providerId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
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
    <div className="flex flex-wrap gap-2">
      <button
        onClick={() => act(verified ? "unverify" : "verify")}
        disabled={pending}
        className="cursor-pointer rounded-full border border-ink-300 bg-surface px-3 py-1.5 text-xs font-semibold text-ink-800 transition hover:border-brand-400 hover:text-brand-700 disabled:opacity-60"
      >
        {verified ? t.admin.unverify : t.admin.verify}
      </button>
      <button
        onClick={() => act(suspended ? "unsuspend" : "suspend")}
        disabled={pending}
        className={`cursor-pointer rounded-full border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-60 ${
          suspended
            ? "border-emerald-300 bg-surface text-emerald-700 hover:bg-emerald-50"
            : "border-red-300 bg-surface text-red-600 hover:bg-red-50"
        }`}
      >
        {suspended ? t.admin.unsuspend : t.admin.suspend}
      </button>
    </div>
  );
}
