"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useT } from "@/components/I18nProvider";
import { useToast } from "@/components/ToastProvider";
import { errorMessage } from "@/lib/error-codes";
import TwoStepConfirmButton from "@/components/ui/TwoStepConfirmButton";

// Provider → customer downgrade (#403). Suspend/hide (reversible): posts
// POST /api/auth/leave-provider, which hides the profile from listings, flips
// the role to CUSTOMER and re-issues the session (no re-login). A two-step
// confirm guards the danger action (#916, shared with AdminDeleteButton).
export default function CloseProviderProfile() {
  const full = useT();
  const t = full.account;
  const toast = useToast();
  const router = useRouter();

  const [error, setError] = useState("");

  async function leave() {
    setError("");
    try {
      const res = await fetch("/api/auth/leave-provider", { method: "POST" });
      if (res.ok) {
        toast.success(t.leaveProviderDone);
        router.refresh();
        return true;
      }
      const data = await res.json().catch(() => ({}));
      setError(errorMessage(data, t.genericError, full.errorCodes));
      return false; // stay in the confirm state so a retry is one click away
    } catch {
      setError(t.genericError);
      return false;
    }
  }

  return (
    <div className="tech-corners overflow-hidden rounded-lg border border-red-300 bg-surface">
      <div className="hazard h-1.5 w-full" />
      <div className="flex items-center justify-between border-b border-red-200 bg-red-50 px-5 py-3 font-mono text-[11px] uppercase tracking-[0.12em] dark:bg-red-950/30">
        <span className="font-bold text-red-700">!</span>
        <span className="text-red-700">{t.leaveProviderTitle}</span>
      </div>
      <div className="p-6">
        <p className="max-w-prose text-sm text-ink-600">{t.leaveProviderBody}</p>
        {error && (
          <p role="alert" className="mt-3 text-sm text-red-600">
            {error}
          </p>
        )}
        <TwoStepConfirmButton
          triggerLabel={t.leaveProviderCta}
          confirmPrompt={t.leaveProviderConfirm}
          confirmLabel={t.leaveProviderCta}
          pendingLabel={t.leavingProvider}
          cancelLabel={t.cancel}
          onConfirm={leave}
          wrapperClassName="mt-4"
          buttonRowClassName="mt-3 flex flex-wrap gap-3"
          triggerClassName="btn-secondary mt-4"
          confirmClassName="inline-flex items-center justify-center gap-2 rounded-md bg-red-600 px-5 py-2.5 font-display text-sm font-semibold text-white transition hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-2 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-red-600/85"
          cancelClassName="btn-secondary"
        />
      </div>
    </div>
  );
}
