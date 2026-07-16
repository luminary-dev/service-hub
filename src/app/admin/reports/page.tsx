import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { apiJson, apiJsonSafe } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { isAdminRole } from "@/lib/roles";
import { getLocale } from "@/lib/locale";
import { dict } from "@/lib/i18n";
import MarkQueueViewed from "@/components/admin/MarkQueueViewed";
import PageHeader from "@/components/ui/PageHeader";
import StatReadout from "@/components/ui/StatReadout";
import Pagination from "@/components/ui/Pagination";
import AdminReportsList, {
  type ReportRow,
} from "@/components/admin/AdminReportsList";
import RunFlaggingButton from "@/components/admin/RunFlaggingButton";
import ReportsFilterBar, {
  type StatusFilter,
  type TargetTypeFilter,
} from "@/components/admin/ReportsFilterBar";

// Caching (#57): admin-only moderation view; edits must be visible on the
// next request — stays fully dynamic (no-store).
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return { title: dict[locale].titles.adminReports };
}

// The moderation queue (#50) merges three sources — provider-service owns
// reports on providers, work photos, inquiry threads and thread messages
// (`GET /api/admin/reports`), review-service owns reports on reviews
// (`GET /api/admin/review-reports`), and job-service owns reports on job
// posts/responses (`GET /api/admin/job-reports`, #375). All return OPEN
// first (newest first) with a hydrated target summary (null when the target
// no longer exists).
const TARGET_TYPES: TargetTypeFilter[] = [
  "PROVIDER",
  "WORK_PHOTO",
  "REVIEW",
  "INQUIRY",
  "MESSAGE",
  "JOB",
  "JOB_RESPONSE",
];
const STATUSES: StatusFilter[] = ["OPEN", "RESOLVED", "DISMISSED"];

const PAGE_SIZE = 20;

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!isAdminRole(session.role)) redirect("/");

  const params = await searchParams;
  const targetType: TargetTypeFilter = TARGET_TYPES.includes(
    params.targetType as TargetTypeFilter
  )
    ? (params.targetType as TargetTypeFilter)
    : "";
  const status: StatusFilter = STATUSES.includes(params.status as StatusFilter)
    ? (params.status as StatusFilter)
    : "";
  const page = Math.max(1, Number(params.page) || 1);

  // Filtering (#223): both underlying queues accept the same `targetType`/
  // `status` params and apply them independently before this page merges
  // their results — a queue whose owner doesn't match the target type
  // filter (e.g. REVIEW at provider-service) just returns an empty list.
  // Pagination (#255): both queues also accept the same page/pageSize and
  // return `total`, so page N is requested from each and merged. A page can
  // therefore carry up to PAGE_SIZE rows from each source; that's the simple,
  // bounded tradeoff for interleaving two independently-ordered queues.
  const query = new URLSearchParams();
  if (targetType) query.set("targetType", targetType);
  if (status) query.set("status", status);
  query.set("page", String(page));
  query.set("pageSize", String(PAGE_SIZE));
  const qs = query.toString();

  const [
    locale,
    providerData,
    reviewData,
    jobData,
    providerCounts,
    reviewCounts,
    jobCounts,
  ] = await Promise.all([
    getLocale(),
    apiJson<{
      reports: Omit<Extract<ReportRow, { service: "provider" }>, "service">[];
      total: number;
    }>(`/api/admin/reports?${qs}`),
    apiJson<{
      reports: Omit<Extract<ReportRow, { service: "review" }>, "service">[];
      total: number;
    }>(`/api/admin/review-reports?${qs}`),
    apiJson<{
      reports: Omit<Extract<ReportRow, { service: "job" }>, "service">[];
      total: number;
    }>(`/api/admin/job-reports?${qs}`),
    // Accurate open totals for the badge + stat readout — a single page no
    // longer sees the whole queue, so the counts come from the dedicated
    // count endpoints (#233) that back the admin hub badge.
    // Best-effort count badges (#747): degrade to zero rather than error the
    // whole queue when a single count endpoint blips.
    apiJsonSafe<{ pendingVerifications: number; openReports: number }>(
      "/api/admin/notifications/counts"
    ),
    apiJsonSafe<{ openReports: number }>("/api/admin/review-reports/count"),
    apiJsonSafe<{ openReports: number }>("/api/admin/job-reports/count"),
  ]);
  const t = dict[locale].admin;

  // Interleave the three queues while keeping each service's ordering
  // contract: OPEN before closed, newest first within each group.
  const rows: ReportRow[] = [
    ...(providerData?.reports ?? []).map(
      (r) => ({ ...r, service: "provider" }) as ReportRow
    ),
    ...(reviewData?.reports ?? []).map(
      (r) => ({ ...r, service: "review" }) as ReportRow
    ),
    ...(jobData?.reports ?? []).map(
      (r) => ({ ...r, service: "job" }) as ReportRow
    ),
  ].sort((a, b) => {
    const openA = a.status === "OPEN" ? 0 : 1;
    const openB = b.status === "OPEN" ? 0 : 1;
    if (openA !== openB) return openA - openB;
    return +new Date(b.createdAt) - +new Date(a.createdAt);
  });

  const providerTotal = providerData?.total ?? 0;
  const reviewTotal = reviewData?.total ?? 0;
  const jobTotal = jobData?.total ?? 0;
  const total = providerTotal + reviewTotal + jobTotal;
  // Each source is paged independently, so the queue has as many pages as its
  // deepest source.
  const totalPages = Math.max(
    1,
    Math.ceil(providerTotal / PAGE_SIZE),
    Math.ceil(reviewTotal / PAGE_SIZE),
    Math.ceil(jobTotal / PAGE_SIZE)
  );

  // Notification badge (#233): "mark viewed" needs the current open count so
  // the admin hub badge clears once this queue has been seen — summed across
  // all three services, independent of the page currently shown.
  const openCount =
    (providerCounts?.openReports ?? 0) +
    (reviewCounts?.openReports ?? 0) +
    (jobCounts?.openReports ?? 0);

  function pageLink(target: number) {
    const sp = new URLSearchParams(query);
    sp.set("page", String(target));
    return `/admin/reports?${sp.toString()}`;
  }

  return (
    <div>
      <MarkQueueViewed queue="reports" count={openCount} />
      <PageHeader
        tag="MOD"
        eyebrow={t.indexTitle}
        title={t.reportsTitle}
        status={t.reportsSubtitle}
      >
        <StatReadout
          stats={[
            { label: t.stats.open, value: openCount },
            { label: t.stats.total, value: total },
          ]}
        />
      </PageHeader>

      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        {/* Auto-flagging trigger + queue filters (#223) sit above the list so
            they stay reachable even when the current filter yields nothing. */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <ReportsFilterBar targetType={targetType} status={status} />
          <RunFlaggingButton role={session.role} />
        </div>

        <AdminReportsList rows={rows} role={session.role} />

        <Pagination page={page} totalPages={totalPages} hrefFor={pageLink} locale={locale} />
      </div>
    </div>
  );
}
