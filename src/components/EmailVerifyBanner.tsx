"use client";

import { useState } from "react";
import { FaEnvelope } from "@/components/icons";
import { useT } from "./I18nProvider";

export default function EmailVerifyBanner({
  message,
}: {
  // Optional context-specific copy (#115): defaults to the generic
  // "please verify" text used on the dashboard; the action-gated forms pass
  // their own prompt ("verify … to contact a provider" / "… to leave a review").
  message?: string;
} = {}) {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">(
    "idle"
  );
  const t = useT();

  async function resend() {
    setState("sending");
    const res = await fetch("/api/auth/resend-verification", {
      method: "POST",
    }).catch(() => null);
    setState(res && res.ok ? "sent" : "error");
  }

  return (
    <div className="mb-6 overflow-hidden rounded-lg border border-amber-300 bg-amber-50">
      {/* Working caution rail — the shared hazard-stripe accent. */}
      <div className="hazard h-1.5 w-full" />
      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        <p className="flex items-center gap-2.5 text-sm font-medium text-amber-900">
          <FaEnvelope className="h-4 w-4 text-amber-600" />
          {message ?? t.verify.bannerText}
        </p>
        {state === "sent" ? (
          <span
            role="status"
            className="flex items-center gap-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-700"
          >
            <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-emerald-700" />
            {t.verify.bannerSent}
          </span>
        ) : (
          <span className="flex flex-wrap items-center gap-3">
            {/* Announce the failure instead of only relabelling the button (#565). */}
            {state === "error" && (
              <span role="alert" className="text-sm font-medium text-red-700">
                {t.verify.bannerError}
              </span>
            )}
            <button
              onClick={resend}
              disabled={state === "sending"}
              className="cursor-pointer rounded-md border border-amber-300 bg-surface px-4 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-amber-900 transition-colors duration-200 ease-snap hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 disabled:opacity-50"
            >
              {state === "sending"
                ? t.verify.bannerSending
                : t.verify.bannerResend}
            </button>
          </span>
        )}
      </div>
    </div>
  );
}
