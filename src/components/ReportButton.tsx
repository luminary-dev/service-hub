"use client";

import { useState } from "react";
import { FaFlag, FaXmark } from "react-icons/fa6";
import { useT } from "./I18nProvider";
import { useToast } from "./ToastProvider";

// Report abusive content (#50): a small trigger that opens a modal with a
// reason select and optional details, then POSTs to the given report endpoint
// (provider / photo / review — the gateway routes each to its owning
// service). Works signed-out too; the outcome lands in a toast.
const REASONS = ["spam", "scam", "offensive", "fake", "other"] as const;

const MAX_DETAILS = 500;

const TRIGGER_STYLES = {
  // Matches ShareButton on the profile header.
  chip: "inline-flex cursor-pointer items-center gap-2 rounded-full border border-ink-300 bg-white px-4 py-2 text-sm font-semibold text-ink-800 transition-[border-color,background-color] duration-200 ease-snap hover:border-red-300 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2",
  // Quiet inline action, e.g. under each review.
  text: "inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium text-ink-400 transition hover:text-red-600",
  // Light-on-dark, for the photo lightbox.
  overlay:
    "inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-black/40 px-3 py-1.5 text-xs font-medium text-white/80 transition hover:text-white",
} as const;

export default function ReportButton({
  endpoint,
  label,
  variant = "text",
  showLabel = true,
}: {
  endpoint: string;
  label: string;
  variant?: keyof typeof TRIGGER_STYLES;
  showLabel?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<(typeof REASONS)[number]>("spam");
  const [details, setDetails] = useState("");
  const [loading, setLoading] = useState(false);
  const t = useT();
  const toast = useToast();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reason,
        details: details.trim() || undefined,
      }),
    }).catch(() => null);
    setLoading(false);
    if (res && res.ok) {
      setOpen(false);
      setReason("spam");
      setDetails("");
      toast.success(t.report.success);
    } else {
      toast.error(t.report.error);
    }
  }

  return (
    <>
      <button
        type="button"
        aria-label={label}
        // stopPropagation: inside the photo lightbox a plain click closes the
        // viewer / navigates — opening the report form must not do either.
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        className={TRIGGER_STYLES[variant]}
      >
        <FaFlag className={variant === "chip" ? "h-4 w-4" : "h-3 w-3"} />
        {showLabel && label}
      </button>

      {open && (
        // z-above the photo lightbox (z-50), which can host this modal.
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"
          onClick={(e) => {
            e.stopPropagation();
            setOpen(false);
          }}
          onTouchStart={(e) => e.stopPropagation()}
          onTouchEnd={(e) => e.stopPropagation()}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={label}
            className="card w-full max-w-md bg-white p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <h2 className="font-semibold text-ink-900">{label}</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t.report.cancel}
                className="cursor-pointer text-ink-400 transition hover:text-ink-700"
              >
                <FaXmark className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-1 text-sm text-ink-500">{t.report.sub}</p>

            <form onSubmit={submit} className="mt-4">
              <label className="label" htmlFor="report-reason">
                {t.report.reason}
              </label>
              <select
                id="report-reason"
                className="input"
                value={reason}
                onChange={(e) =>
                  setReason(e.target.value as (typeof REASONS)[number])
                }
              >
                {REASONS.map((r) => (
                  <option key={r} value={r}>
                    {t.report.reasons[r]}
                  </option>
                ))}
              </select>

              <label className="label mt-3" htmlFor="report-details">
                {t.report.details}{" "}
                <span className="font-normal text-ink-400">
                  {t.report.optional}
                </span>
              </label>
              <textarea
                id="report-details"
                className="input min-h-20 resize-y"
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                maxLength={MAX_DETAILS}
                placeholder={t.report.detailsPh}
              />

              <div className="mt-4 flex gap-2">
                <button type="submit" disabled={loading} className="btn-primary">
                  {loading ? t.report.sending : t.report.submit}
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="btn-ghost"
                >
                  {t.report.cancel}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
