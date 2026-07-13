"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FaFlag } from "@/components/icons";
import { useT, useLocale } from "../I18nProvider";
import { formatDate } from "@/lib/format";
import { isSvg } from "@/lib/image";
import { hasSupportAccess } from "@/lib/roles";
import Stars from "../Stars";
import InView from "../InView";
import EmptyState from "../ui/EmptyState";
import AdminDeleteButton from "./AdminDeleteButton";
import AdminRestoreButton from "./AdminRestoreButton";
import ReportActions from "./ReportActions";

// The moderation queue (#50) merges three sources — provider-service owns
// reports on providers, work photos, inquiry threads and thread messages
// (`GET /api/admin/reports`), review-service owns reports on reviews
// (`GET /api/admin/review-reports`), job-service owns reports on job posts
// and responses (`GET /api/admin/job-reports`, #375/#376). All return OPEN
// first (newest first) with a hydrated target summary (null when the target
// no longer exists).
type ReportBase = {
  id: string;
  targetType:
    | "PROVIDER"
    | "WORK_PHOTO"
    | "INQUIRY"
    | "MESSAGE"
    | "REVIEW"
    | "JOB"
    | "JOB_RESPONSE";
  targetId: string;
  reporterId: string | null;
  reason: string;
  details: string | null;
  status: "OPEN" | "RESOLVED" | "DISMISSED";
  // Report origin: USER = the public report flow, SYSTEM = auto-created
  // (threshold flagging #232, write-time content filter #375).
  source: "USER" | "SYSTEM";
  createdAt: string;
  // Resolution audit trail (#223): stamped when the report is resolved or
  // dismissed; null while OPEN (and for pre-existing rows closed before the
  // audit trail shipped).
  resolvedBy: string | null;
  resolvedAt: string | null;
};

type ProviderReport = ReportBase & {
  targetType: "PROVIDER" | "WORK_PHOTO" | "INQUIRY" | "MESSAGE";
  target: {
    providerId: string;
    providerName: string;
    suspended?: boolean;
    photoUrl?: string;
    caption?: string | null;
    removed?: boolean;
    // INQUIRY targets (#375): thread context — the flagged excerpt itself is
    // in the report's `details`.
    customerName?: string;
    message?: string;
    // MESSAGE targets (#376): the reported thread message.
    messageId?: string;
    sender?: "CUSTOMER" | "PROVIDER";
    body?: string;
  } | null;
};

type ReviewReport = ReportBase & {
  targetType: "REVIEW";
  target: {
    reviewId: string;
    rating: number;
    comment: string;
    providerId: string;
    removed: boolean;
  } | null;
};

type JobReport = ReportBase & {
  targetType: "JOB" | "JOB_RESPONSE";
  target: {
    jobId: string;
    // JOB targets
    title?: string;
    description?: string;
    status?: string;
    // Taken down by an admin (#376) — reversible soft-hide.
    removed?: boolean;
    // JOB_RESPONSE targets
    jobTitle?: string;
    message?: string;
    providerId?: string;
  } | null;
};

// `service` names the backend queue a row came from (routing for actions);
// the Prisma `source` above stays USER/SYSTEM.
export type ReportRow =
  | (ProviderReport & { service: "provider" })
  | (ReviewReport & { service: "review" })
  | (JobReport & { service: "job" });

const BATCH_ENDPOINTS: Record<ReportRow["service"], string> = {
  provider: "/api/admin/reports",
  review: "/api/admin/review-reports",
  job: "/api/admin/job-reports",
};

// Reports list (#231): multi-select + bulk resolve/dismiss on top of the
// existing per-row ReportActions. Reports come from three different backend
// services, so the bulk action groups the selected ids by owning service
// before calling each service's batch endpoint. Only OPEN reports are
// selectable — closed ones have nothing left to bulk-act on.
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
    return `${r.service}-${r.id}`;
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

    const calls: Promise<Response | null>[] = [];
    for (const service of Object.keys(BATCH_ENDPOINTS) as ReportRow["service"][]) {
      const ids = openRows
        .filter((r) => r.service === service && selected.has(key(r)))
        .map((r) => r.id);
      if (ids.length) {
        calls.push(
          fetch(BATCH_ENDPOINTS[service], {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ids, status }),
          }).catch(() => null)
        );
      }
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
    INQUIRY: t.reportedInquiry,
    MESSAGE: t.reportedMessage,
    JOB: t.reportedJob,
    JOB_RESPONSE: t.reportedJobResponse,
  } as const;

  const reasonLabel = (reason: string) =>
    reason in tr.reasons ? tr.reasons[reason as keyof typeof tr.reasons] : reason;

  if (rows.length === 0) {
    return (
      <div className="mt-6">
        <EmptyState icon={FaFlag} title={t.reportsEmpty} />
      </div>
    );
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

      {/* Active caution rail: open reports are awaiting moderation. */}
      {openRows.length > 0 && (
        <div className="hazard mb-6 mt-6 h-1.5 w-full rounded-full" />
      )}
      <InView as="ul" stagger className="mt-3 space-y-3">
        {rows.map((r) => (
          <li key={key(r)} className="tech-corners card p-4">
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
                    <span className="chip bg-ink-100 font-mono uppercase tracking-[0.08em] text-ink-600">
                      {typeLabel[r.targetType]}
                    </span>
                    {r.status === "OPEN" && (
                      <span className="chip bg-amber-50 text-amber-700 ring-1 ring-amber-200">
                        <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-amber-600" />
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
                  <p className="mt-2 flex flex-wrap items-center gap-1.5 font-mono text-xs text-ink-500">
                    <span className="tabular-nums text-ink-600">
                      {formatDate(r.createdAt, locale)}
                    </span>
                    <span className="text-ink-300">·</span>
                    <span className="text-ink-400">{t.reportedBy}</span>
                    <span className="text-ink-600">
                      {r.source === "SYSTEM"
                        ? t.reportSystem
                        : (r.reporterId ?? t.reportAnonymous)}
                    </span>
                  </p>
                  {r.status !== "OPEN" && r.resolvedBy && r.resolvedAt && (
                    <p className="mt-1 font-mono text-xs text-ink-500">
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
                  endpoint={`${BATCH_ENDPOINTS[r.service]}/${r.id}`}
                  role={role}
                />
              )}
            </div>

            <div className="mt-3 rounded-xl border border-dashed border-ink-200 bg-ink-50 p-3">
              {r.target === null ? (
                <p className="text-sm text-ink-500">{t.reportTargetGone}</p>
              ) : r.service === "job" ? (
                // Job post / job response (#375): title + text excerpt, with
                // the admin job detail as the moderation surface.
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-medium text-ink-800">
                        {r.targetType === "JOB" ? r.target.title : r.target.jobTitle}
                      </p>
                      {r.target.removed && (
                        <span className="chip bg-red-50 text-red-700 ring-1 ring-red-200">
                          {t.jobHiddenTag}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 line-clamp-3 text-sm text-ink-600">
                      {r.targetType === "JOB"
                        ? r.target.description
                        : r.target.message}
                    </p>
                  </div>
                  <Link
                    href={`/admin/jobs/${r.target.jobId}`}
                    className="shrink-0 text-sm font-semibold text-brand-700 transition-colors duration-200 ease-snap hover:text-brand-800"
                  >
                    {t.moderate}
                  </Link>
                </div>
              ) : r.service === "provider" && r.targetType === "MESSAGE" ? (
                // Reported thread message (#376): show the body with the
                // takedown/restore control inline — there is no separate
                // admin surface for private threads.
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-medium text-ink-800">
                        {r.target.providerName}
                      </p>
                      <span className="chip bg-ink-100 text-ink-500">
                        {r.target.sender === "PROVIDER"
                          ? t.msgSenderProvider
                          : t.msgSenderCustomer}
                      </span>
                      {r.target.removed && (
                        <span className="chip bg-red-50 text-red-700 ring-1 ring-red-200">
                          {t.reportContentRemoved}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 line-clamp-3 text-sm text-ink-600">
                      {r.target.body}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    {r.target.removed ? (
                      <AdminRestoreButton
                        endpoint={`/api/admin/messages/${r.target.messageId}/restore`}
                        role={role}
                      />
                    ) : (
                      <AdminDeleteButton
                        endpoint={`/api/admin/messages/${r.target.messageId}`}
                        role={role}
                      />
                    )}
                    <Link
                      href={`/admin/providers/${r.target.providerId}`}
                      className="text-sm font-semibold text-brand-700 transition-colors duration-200 ease-snap hover:text-brand-800"
                    >
                      {t.moderate}
                    </Link>
                  </div>
                </div>
              ) : r.service === "provider" && r.targetType === "INQUIRY" ? (
                // Inquiry thread (#375): who wrote to which provider, plus the
                // original inquiry message — the flagged excerpt itself is in
                // the report's `details` above.
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink-800">
                      {r.target.customerName} → {r.target.providerName}
                    </p>
                    <p className="mt-1 line-clamp-3 text-sm text-ink-600">
                      {r.target.message}
                    </p>
                  </div>
                  <Link
                    href={`/admin/providers/${r.target.providerId}`}
                    className="shrink-0 text-sm font-semibold text-brand-700 transition-colors duration-200 ease-snap hover:text-brand-800"
                  >
                    {t.moderate}
                  </Link>
                </div>
              ) : r.service === "review" ? (
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
                    className="shrink-0 text-sm font-semibold text-brand-700 transition-colors duration-200 ease-snap hover:text-brand-800"
                  >
                    {t.moderate}
                  </Link>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    {r.targetType === "WORK_PHOTO" && r.target.photoUrl && (
                      <Image
                        src={r.target.photoUrl}
                        alt={r.target.caption ?? "Reported photo"}
                        width={56}
                        height={56}
                        unoptimized={isSvg(r.target.photoUrl)}
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
                    className="shrink-0 text-sm font-semibold text-brand-700 transition-colors duration-200 ease-snap hover:text-brand-800"
                  >
                    {t.moderate}
                  </Link>
                </div>
              )}
            </div>
          </li>
        ))}
      </InView>
    </div>
  );
}
