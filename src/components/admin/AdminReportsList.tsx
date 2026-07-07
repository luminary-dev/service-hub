/* eslint-disable @next/next/no-img-element */
"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useT, useLocale } from "../I18nProvider";
import { formatDate } from "@/lib/format";
import { hasSupportAccess } from "@/lib/roles";
import Stars from "../Stars";
import ReportActions from "./ReportActions";

// The moderation queue (#50) merges two sources — provider-service owns
// reports on providers and work photos (`GET /api/admin/reports`),
// review-service owns reports on reviews (`GET /api/admin/review-reports`).
// Both return OPEN first (newest first) with a hydrated target summary
// (null when the target no longer exists).
type ReportBase = {
  id: string;
  targetType: "PROVIDER" | "WORK_PHOTO" | "REVIEW";
  targetId: string;
  reporterId: string | null;
  reason: string;
  details: string | null;
  status: "OPEN" | "RESOLVED" | "DISMISSED";
  createdAt: string;
  // Resolution audit trail (#223): stamped when the report is resolved or
  // dismissed; null while OPEN (and for pre-existing rows closed before the
  // audit trail shipped).
  resolvedBy: string | null;
  resolvedAt: string | null;
};

type ProviderReport = ReportBase & {
  target: {
    providerId: string;
    providerName: string;
    suspended?: boolean;
    photoUrl?: string;
    caption?: string | null;
    removed?: boolean;
  } | null;
};

type ReviewReport = ReportBase & {
  target: {
    reviewId: string;
    rating: number;
    comment: string;
    providerId: string;
    removed: boolean;
  } | null;
};

export type ReportRow =
  | (ProviderReport & { source: "provider" })
  | (ReviewReport & { source: "review" });

// Reports list (#231): multi-select + bulk resolve/dismiss on top of the
// existing per-row ReportActions. Reports come from two different backend
// services (provider-service owns PROVIDER/WORK_PHOTO reports at
// `/api/admin/reports`, review-service owns REVIEW reports at
// `/api/admin/review-reports`), so the bulk action groups the selected ids
// by source before calling each service's batch endpoint. Only OPEN reports
// are selectable — closed ones have nothing left to bulk-act on.
export default function AdminReportsList({
  rows,
  role,
}: {
  rows: ReportRow[];
  role: string;
}) {
  const t = useT().admin;
  const tr = useT().report;
  const locale = useLocale();
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  // Resolve/dismiss is part of the SUPPORT tier (#226), same gate as the
  // per-row ReportActions — admins without support access don't get the
  // multi-select toolbar.
  const canAct = hasSupportAccess(role);
  const openRows = rows.filter((r) => r.status === "OPEN");
  const allSelected = openRows.length > 0 && selected.size === openRows.length;

  function key(r: ReportRow) {
    return `${r.source}-${r.id}`;
  }

  function toggle(r: ReportRow) {
    setSelected((prev) => {
      const next = new Set(prev);
      const k = key(r);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(openRows.map(key)));
  }

  async function bulkAct(status: "RESOLVED" | "DISMISSED") {
    if (selected.size === 0) return;
    setPending(true);
    setError(false);

    const providerIds = openRows
      .filter((r) => r.source === "provider" && selected.has(key(r)))
      .map((r) => r.id);
    const reviewIds = openRows
      .filter((r) => r.source === "review" && selected.has(key(r)))
      .map((r) => r.id);

    const calls: Promise<Response | null>[] = [];
    if (providerIds.length) {
      calls.push(
        fetch("/api/admin/reports", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: providerIds, status }),
        }).catch(() => null)
      );
    }
    if (reviewIds.length) {
      calls.push(
        fetch("/api/admin/review-reports", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: reviewIds, status }),
        }).catch(() => null)
      );
    }

    const results = await Promise.all(calls);
    setPending(false);
    const allOk = results.length > 0 && results.every((res) => res && res.ok);
    if (allOk) {
      setSelected(new Set());
      router.refresh();
    } else {
      setError(true);
    }
  }

  const typeLabel = {
    PROVIDER: t.reportedProvider,
    WORK_PHOTO: t.reportedPhoto,
    REVIEW: t.reportedReview,
  } as const;

  const reasonLabel = (reason: string) =>
    reason in tr.reasons ? tr.reasons[reason as keyof typeof tr.reasons] : reason;

  if (rows.length === 0) {
    return <p className="mt-8 text-sm text-ink-500">{t.reportsEmpty}</p>;
  }

  return (
    <div>
      {canAct && selected.size > 0 && (
        <div className="card sticky top-2 z-10 mt-6 flex flex-wrap items-center justify-between gap-3 p-3">
          <span className="text-sm font-medium text-ink-700">
            {t.selectedCount(selected.size)}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => bulkAct("RESOLVED")}
              disabled={pending}
              className="cursor-pointer rounded-full border border-emerald-300 bg-surface px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-60"
            >
              {t.bulkResolve}
            </button>
            <button
              onClick={() => bulkAct("DISMISSED")}
              disabled={pending}
              className="cursor-pointer rounded-full border border-ink-300 bg-surface px-3 py-1.5 text-xs font-semibold text-ink-600 transition hover:border-ink-400 disabled:opacity-60"
            >
              {t.bulkDismiss}
            </button>
            <button
              onClick={() => setSelected(new Set())}
              disabled={pending}
              className="cursor-pointer rounded-full border border-ink-300 bg-surface px-3 py-1.5 text-xs font-semibold text-ink-600 transition hover:border-ink-400 disabled:opacity-60"
            >
              {t.clearSelection}
            </button>
          </div>
        </div>
      )}
      {canAct && error && (
        <p className="mt-3 text-sm text-red-600">{t.bulkActionError}</p>
      )}

      {canAct && openRows.length > 0 && (
        <label className="mt-6 flex items-center gap-2 text-sm text-ink-600">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleAll}
            className="size-4 rounded border-ink-300"
          />
          {t.selectAll}
        </label>
      )}

      <ul className="mt-3 space-y-3">
        {rows.map((r) => (
          <li key={key(r)} className="card p-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex min-w-0 items-start gap-3">
                {canAct && r.status === "OPEN" && (
                  <input
                    type="checkbox"
                    checked={selected.has(key(r))}
                    onChange={() => toggle(r)}
                    className="mt-1 size-4 shrink-0 rounded border-ink-300"
                    aria-label={t.selectedCount(1)}
                  />
                )}
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="chip bg-ink-100 text-ink-600">
                      {typeLabel[r.targetType]}
                    </span>
                    {r.status === "OPEN" && (
                      <span className="chip bg-amber-50 text-amber-700 ring-1 ring-amber-200">
                        {t.openTag}
                      </span>
                    )}
                    {r.status === "RESOLVED" && (
                      <span className="chip bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
                        {t.resolvedTag}
                      </span>
                    )}
                    {r.status === "DISMISSED" && (
                      <span className="chip bg-ink-100 text-ink-500">
                        {t.dismissedTag}
                      </span>
                    )}
                    <span className="text-sm font-semibold text-ink-900">
                      {reasonLabel(r.reason)}
                    </span>
                  </div>
                  {r.details && (
                    <p className="mt-2 whitespace-pre-line text-sm text-ink-600">
                      {r.details}
                    </p>
                  )}
                  <p className="mt-2 text-xs text-ink-500">
                    {formatDate(r.createdAt, locale)} · {t.reportedBy}{" "}
                    {r.reporterId ?? t.reportAnonymous}
                  </p>
                  {r.status !== "OPEN" && r.resolvedBy && r.resolvedAt && (
                    <p className="mt-1 text-xs text-ink-500">
                      {t.reportResolvedMeta(
                        r.resolvedBy,
                        formatDate(r.resolvedAt, locale)
                      )}
                    </p>
                  )}
                </div>
              </div>
              {r.status === "OPEN" && (
                <ReportActions
                  endpoint={
                    r.source === "provider"
                      ? `/api/admin/reports/${r.id}`
                      : `/api/admin/review-reports/${r.id}`
                  }
                  role={role}
                />
              )}
            </div>

            <div className="mt-3 rounded-xl bg-ink-50 p-3">
              {r.target === null ? (
                <p className="text-sm text-ink-500">{t.reportTargetGone}</p>
              ) : r.source === "review" ? (
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Stars rating={r.target.rating} />
                      {r.target.removed && (
                        <span className="chip bg-red-50 text-red-700 ring-1 ring-red-200">
                          {t.reportContentRemoved}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 line-clamp-3 text-sm text-ink-600">
                      {r.target.comment}
                    </p>
                  </div>
                  <Link
                    href={`/admin/providers/${r.target.providerId}`}
                    className="shrink-0 text-sm font-medium text-brand-700 hover:text-brand-800"
                  >
                    {t.moderate}
                  </Link>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    {r.targetType === "WORK_PHOTO" && r.target.photoUrl && (
                      <img
                        src={r.target.photoUrl}
                        alt={r.target.caption ?? "Reported photo"}
                        className="h-14 w-14 shrink-0 rounded-lg object-cover"
                      />
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink-800">
                        {r.target.providerName}
                      </p>
                      <div className="mt-0.5 flex flex-wrap gap-1.5">
                        {r.target.suspended && (
                          <span className="chip bg-red-50 text-red-700 ring-1 ring-red-200">
                            {t.suspendedTag}
                          </span>
                        )}
                        {r.target.removed && (
                          <span className="chip bg-red-50 text-red-700 ring-1 ring-red-200">
                            {t.reportContentRemoved}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <Link
                    href={`/admin/providers/${r.target.providerId}`}
                    className="shrink-0 text-sm font-medium text-brand-700 hover:text-brand-800"
                  >
                    {t.moderate}
                  </Link>
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
