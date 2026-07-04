"use client";

import { useState } from "react";
import { FaEnvelope } from "react-icons/fa6";
import { useT } from "./I18nProvider";

export default function EmailVerifyBanner() {
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
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
      <p className="flex items-center gap-2 text-sm font-medium text-amber-900">
        <FaEnvelope className="h-4 w-4 text-amber-600" />
        {t.verify.bannerText}
      </p>
      {state === "sent" ? (
        <span className="text-sm font-medium text-emerald-700">
          {t.verify.bannerSent}
        </span>
      ) : (
        <button
          onClick={resend}
          disabled={state === "sending"}
          className="cursor-pointer rounded-full border border-amber-300 bg-surface px-4 py-1.5 text-sm font-semibold text-amber-900 transition hover:bg-amber-100 disabled:opacity-50"
        >
          {state === "sending"
            ? t.verify.bannerSending
            : state === "error"
              ? t.verify.bannerError
              : t.verify.bannerResend}
        </button>
      )}
    </div>
  );
}
