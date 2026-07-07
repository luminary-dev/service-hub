import { redirect } from "next/navigation";
import { apiJson } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { dict } from "@/lib/i18n";
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

// The moderation queue (#50) merges two sources — provider-service owns
// reports on providers and work photos (`GET /api/admin/reports`),
// review-service owns reports on reviews (`GET /api/admin/review-reports`).
// Both return OPEN first (newest first) with a hydrated target summary
// (null when the target no longer exists).
const TARGET_TYPES: TargetTypeFilter[] = ["PROVIDER", "WORK_PHOTO", "REVIEW"];
const STATUSES: StatusFilter[] = ["OPEN", "RESOLVED", "DISMISSED"];

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "ADMIN") redirect("/");

  const params = await searchParams;
  const targetType: TargetTypeFilter = TARGET_TYPES.includes(
    params.targetType as TargetTypeFilter
  )
    ? (params.targetType as TargetTypeFilter)
    : "";
  const status: StatusFilter = STATUSES.includes(params.status as StatusFilter)
    ? (params.status as StatusFilter)
    : "";

  // Filtering (#223): both underlying queues accept the same `targetType`/
  // `status` params and apply them independently before this page merges
  // their results — a queue whose owner doesn't match the target type
  // filter (e.g. REVIEW at provider-service) just returns an empty list.
  const query = new URLSearchParams();
  if (targetType) query.set("targetType", targetType);
  if (status) query.set("status", status);
  const qs = query.toString();

  const [locale, providerData, reviewData] = await Promise.all([
    getLocale(),
    apiJson<{
      reports: Omit<Extract<ReportRow, { source: "provider" }>, "source">[];
    }>(`/api/admin/reports${qs ? `?${qs}` : ""}`),
    apiJson<{
      reports: Omit<Extract<ReportRow, { source: "review" }>, "source">[];
    }>(`/api/admin/review-reports${qs ? `?${qs}` : ""}`),
  ]);
  const t = dict[locale].admin;

  // Interleave the two queues while keeping each service's ordering contract:
  // OPEN before closed, newest first within each group.
  const rows: ReportRow[] = [
    ...(providerData?.reports ?? []).map(
      (r) => ({ ...r, source: "provider" }) as ReportRow
    ),
    ...(reviewData?.reports ?? []).map(
      (r) => ({ ...r, source: "review" }) as ReportRow
    ),
  ].sort((a, b) => {
    const openA = a.status === "OPEN" ? 0 : 1;
    const openB = b.status === "OPEN" ? 0 : 1;
    if (openA !== openB) return openA - openB;
    return +new Date(b.createdAt) - +new Date(a.createdAt);
  });

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

      <div className="mt-6">
        <ReportsFilterBar targetType={targetType} status={status} />
      </div>

      <AdminReportsList rows={rows} />
    </div>
  );
}
