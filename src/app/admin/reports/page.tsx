/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { redirect } from "next/navigation";
import { apiJson } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { dict } from "@/lib/i18n";
import { formatDate } from "@/lib/format";
import Stars from "@/components/Stars";
import ReportActions from "@/components/admin/ReportActions";
import RunFlaggingButton from "@/components/admin/RunFlaggingButton";

// Caching (#57): admin-only moderation view; edits must be visible on the
// next request — stays fully dynamic (no-store).
export const dynamic = "force-dynamic";

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

type Row =
  | (ProviderReport & { source: "provider" })
  | (ReviewReport & { source: "review" });

export default async function AdminReportsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "ADMIN") redirect("/");

  const [locale, providerData, reviewData] = await Promise.all([
    getLocale(),
    apiJson<{ reports: ProviderReport[] }>("/api/admin/reports"),
    apiJson<{ reports: ReviewReport[] }>("/api/admin/review-reports"),
  ]);
  const t = dict[locale].admin;
  const tr = dict[locale].report;

  // Interleave the two queues while keeping each service's ordering contract:
  // OPEN before closed, newest first within each group.
  const rows: Row[] = [
    ...(providerData?.reports ?? []).map(
      (r) => ({ ...r, source: "provider" }) as Row
    ),
    ...(reviewData?.reports ?? []).map(
      (r) => ({ ...r, source: "review" }) as Row
    ),
  ].sort((a, b) => {
    const openA = a.status === "OPEN" ? 0 : 1;
    const openB = b.status === "OPEN" ? 0 : 1;
    if (openA !== openB) return openA - openB;
    return +new Date(b.createdAt) - +new Date(a.createdAt);
  });

  const typeLabel = {
    PROVIDER: t.reportedProvider,
    WORK_PHOTO: t.reportedPhoto,
    REVIEW: t.reportedReview,
  } as const;

  const reasonLabel = (reason: string) =>
    reason in tr.reasons ? tr.reasons[reason as keyof typeof tr.reasons] : reason;

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-ink-900">
            {t.reportsTitle}
          </h1>
          <p className="mt-1 text-ink-600">{t.reportsSubtitle}</p>
        </div>
        <RunFlaggingButton />
      </div>

      {rows.length === 0 ? (
        <p className="mt-8 text-sm text-ink-500">{t.reportsEmpty}</p>
      ) : (
        <ul className="mt-8 space-y-3">
          {rows.map((r) => (
            <li key={`${r.source}-${r.id}`} className="card p-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
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
                </div>
                {r.status === "OPEN" && (
                  <ReportActions
                    endpoint={
                      r.source === "provider"
                        ? `/api/admin/reports/${r.id}`
                        : `/api/admin/review-reports/${r.id}`
                    }
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
      )}
    </div>
  );
}
