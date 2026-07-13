"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FaClock, FaFileLines } from "@/components/icons";
import Avatar from "@/components/Avatar";
import InView from "@/components/InView";
import { categoryLabelLoc } from "@/lib/i18n";
import { daysSince, formatDate } from "@/lib/format";
import { useLocale, useT } from "../I18nProvider";
import VerificationActions from "./VerificationActions";

// Pending queue as served by `GET /api/admin/verifications` on the gateway
// (oldest submission first, with docs and contact details). `updatedAt` is
// the submission timestamp — the queue moves a provider into PENDING and
// stamps this, so it also drives the "waiting N days" SLA badge below.
export type PendingVerification = {
  id: string;
  category: string;
  city: string;
  avatarUrl: string | null;
  updatedAt: string;
  user: { name: string; email: string };
  verificationDocs: { id: string; kind: string; url: string }[];
};

function waitingBadgeClass(days: number): string {
  if (days >= 7) return "bg-red-50 text-red-700 ring-red-200";
  if (days >= 3) return "bg-amber-50 text-amber-700 ring-amber-200";
  return "bg-ink-100 text-ink-600 ring-ink-200";
}

export default function VerificationQueue({
  items,
}: {
  items: PendingVerification[];
}) {
  const locale = useLocale();
  const t = useT().admin;
  const router = useRouter();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showBulkReason, setShowBulkReason] = useState(false);
  const [bulkReason, setBulkReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  const allSelected = items.length > 0 && selected.size === items.length;

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(items.map((p) => p.id)));
  }

  async function bulkAct(action: "approve" | "reject") {
    if (selected.size === 0 || pending) return;
    if (action === "reject" && !showBulkReason) {
      setShowBulkReason(true);
      return;
    }

    setPending(true);
    setError(false);
    const res = await fetch("/api/admin/verifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ids: Array.from(selected),
        action,
        ...(action === "reject" && bulkReason.trim()
          ? { reason: bulkReason.trim() }
          : {}),
      }),
    }).catch(() => null);
    setPending(false);

    if (res && res.ok) {
      setSelected(new Set());
      setBulkReason("");
      setShowBulkReason(false);
      router.refresh();
    } else {
      setError(true);
    }
  }

  const now = useMemo(() => new Date(), []);

  return (
    <div>
      <div className="mt-6 flex flex-wrap items-center gap-3 rounded-xl border border-ink-200 bg-ink-50 px-4 py-3">
        <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-ink-700">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleAll}
            className="h-4 w-4 rounded border-ink-300"
          />
          {t.selectAll}
        </label>
        <span className="text-sm text-ink-500">{t.selectedCount(selected.size)}</span>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => bulkAct("approve")}
            disabled={selected.size === 0 || pending}
            className="btn-primary !px-4 !py-2"
          >
            {t.approveSelected}
          </button>
          <button
            type="button"
            onClick={() => bulkAct("reject")}
            disabled={selected.size === 0 || pending}
            className="cursor-pointer rounded-full border border-ink-300 bg-surface px-4 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-60"
          >
            {t.rejectSelected}
          </button>
        </div>

        {showBulkReason && (
          <div className="w-full">
            <label className="label" htmlFor="bulk-rejection-reason">
              {t.rejectionReasonLabel}
            </label>
            <textarea
              id="bulk-rejection-reason"
              className="input"
              rows={2}
              value={bulkReason}
              onChange={(e) => setBulkReason(e.target.value)}
              placeholder={t.rejectionReasonPlaceholder}
            />
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => bulkAct("reject")}
                disabled={pending}
                className="cursor-pointer rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
              >
                {t.confirmReject}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowBulkReason(false);
                  setBulkReason("");
                }}
                className="btn-ghost"
              >
                {t.cancel}
              </button>
            </div>
          </div>
        )}

        {error && (
          <p role="alert" className="w-full text-sm text-red-600">
            {t.bulkActionError}
          </p>
        )}
      </div>

      <InView as="ul" stagger className="mt-4 space-y-4">
        {items.map((p) => {
          const days = daysSince(p.updatedAt, now);
          return (
            <li key={p.id} className="tech-corners card p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={selected.has(p.id)}
                    onChange={() => toggleOne(p.id)}
                    aria-label={t.selectOne}
                    className="mt-2 h-4 w-4 rounded border-ink-300"
                  />
                  <Avatar name={p.user.name} url={p.avatarUrl} size={44} />
                  <div>
                    <p className="font-semibold text-ink-900">{p.user.name}</p>
                    <p className="text-sm text-ink-500">
                      {categoryLabelLoc(p.category, locale)} · {p.city} ·{" "}
                      {p.user.email}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-xs uppercase tracking-[0.08em] text-ink-500">
                      <span className="flex items-center gap-1.5">
                        <span className="text-ink-400">{t.submitted}</span>
                        <span className="tabular-nums text-ink-600">
                          {formatDate(p.updatedAt, locale)}
                        </span>
                      </span>
                      <span
                        className={`chip ring-1 ${waitingBadgeClass(days)}`}
                      >
                        <FaClock className="h-3 w-3" />
                        {t.waitingDays(days)}
                      </span>
                    </div>
                  </div>
                </div>
                <VerificationActions providerId={p.id} />
              </div>

              <div className="mt-4 border-t border-dashed border-ink-200 pt-4">
                <p className="eyebrow mb-2 !text-ink-500">{t.documents}</p>
                {p.verificationDocs.length === 0 ? (
                  <p className="text-sm text-ink-400">—</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {p.verificationDocs.map((d) => (
                      <a
                        key={d.id}
                        href={d.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 bg-ink-50 px-3 py-1.5 text-sm font-medium text-ink-700 transition-[border-color,color] duration-200 ease-snap hover:border-brand-400 hover:text-brand-700"
                      >
                        <FaFileLines className="h-3.5 w-3.5" />
                        {d.kind}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </InView>
    </div>
  );
}
