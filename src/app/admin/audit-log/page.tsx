import Link from "next/link";
import { redirect } from "next/navigation";
import { apiJson } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { dict } from "@/lib/i18n";
import { formatDate } from "@/lib/format";

// Caching (#57): admin-only moderation view; edits must be visible on the
// next request — stays fully dynamic (no-store).
export const dynamic = "force-dynamic";

// The audit trail (#227, #376) merges three sources — provider-service owns
// the log for actions it takes (provider verify/suspend, photo/message
// delete, report resolve/dismiss, category create/edit) at
// `GET /api/admin/audit-log`; review-service owns the log for the actions it
// takes (review delete, report resolve/dismiss) at
// `GET /api/admin/review-audit-log`; job-service owns the log for the
// actions it takes (job hide/unhide, report resolve/dismiss) at
// `GET /api/admin/job-audit-log`. All accept the same adminId/action/from/to
// filters and return newest-first.
type AuditEntry = {
  id: string;
  adminId: string;
  action: string;
  targetType: string;
  targetId: string;
  reason: string | null;
  createdAt: string;
};

type Row = AuditEntry & { source: "provider" | "review" | "job" };

const DATE_TIME_OPTS: Intl.DateTimeFormatOptions = {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
};

export default async function AdminAuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "ADMIN") redirect("/");

  const params = await searchParams;
  const adminId = typeof params.adminId === "string" ? params.adminId.trim() : "";
  const action = typeof params.action === "string" ? params.action.trim() : "";
  const from = typeof params.from === "string" ? params.from.trim() : "";
  const to = typeof params.to === "string" ? params.to.trim() : "";

  const query = new URLSearchParams();
  if (adminId) query.set("adminId", adminId);
  if (action) query.set("action", action);
  if (from) query.set("from", from);
  // A bare date (YYYY-MM-DD) parses to that day's midnight — extend "to" to
  // the end of the day so the filter reads as an inclusive calendar range.
  if (to) query.set("to", /^\d{4}-\d{2}-\d{2}$/.test(to) ? `${to}T23:59:59.999` : to);
  const qs = query.toString();

  const [locale, providerData, reviewData, jobData] = await Promise.all([
    getLocale(),
    apiJson<{ entries: AuditEntry[] }>(`/api/admin/audit-log${qs ? `?${qs}` : ""}`),
    apiJson<{ entries: AuditEntry[] }>(`/api/admin/review-audit-log${qs ? `?${qs}` : ""}`),
    apiJson<{ entries: AuditEntry[] }>(`/api/admin/job-audit-log${qs ? `?${qs}` : ""}`),
  ]);
  const t = dict[locale].admin;

  const rows: Row[] = [
    ...(providerData?.entries ?? []).map((e) => ({ ...e, source: "provider" }) as Row),
    ...(reviewData?.entries ?? []).map((e) => ({ ...e, source: "review" }) as Row),
    ...(jobData?.entries ?? []).map((e) => ({ ...e, source: "job" }) as Row),
  ].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));

  const targetLabel = (targetType: string) => {
    switch (targetType) {
      case "PROVIDER":
        return t.auditTargetProvider;
      case "WORK_PHOTO":
        return t.auditTargetPhoto;
      case "REVIEW":
        return t.auditTargetReview;
      case "REPORT":
        return t.auditTargetReport;
      case "CATEGORY":
        return t.auditTargetCategory;
      case "JOB":
        return t.auditTargetJob;
      case "MESSAGE":
        return t.auditTargetMessage;
      default:
        return targetType;
    }
  };

  const actionLabel = (a: string) =>
    a in t.auditActions ? t.auditActions[a as keyof typeof t.auditActions] : a;

  const hasFilters = !!(adminId || action || from || to);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight text-ink-900">
        {t.auditLogTitle}
      </h1>
      <p className="mt-1 text-ink-600">{t.auditLogSubtitle}</p>

      <form className="card mt-6 grid gap-3 p-4 sm:grid-cols-4" method="GET">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-ink-600">{t.auditLogFilterAdmin}</span>
          <input
            type="text"
            name="adminId"
            defaultValue={adminId}
            className="input"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-ink-600">{t.auditLogFilterAction}</span>
          <input
            type="text"
            name="action"
            defaultValue={action}
            className="input"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-ink-600">{t.auditLogFilterFrom}</span>
          <input type="date" name="from" defaultValue={from} className="input" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-ink-600">{t.auditLogFilterTo}</span>
          <input type="date" name="to" defaultValue={to} className="input" />
        </label>
        <div className="flex items-end gap-2 sm:col-span-4">
          <button type="submit" className="btn-primary">
            {t.auditLogApply}
          </button>
          {hasFilters && (
            <Link href="/admin/audit-log" className="btn-secondary">
              {t.auditLogClear}
            </Link>
          )}
        </div>
      </form>

      {rows.length === 0 ? (
        <p className="mt-8 text-sm text-ink-500">{t.auditLogEmpty}</p>
      ) : (
        <ul className="mt-8 space-y-3">
          {rows.map((r) => (
            <li key={`${r.source}-${r.id}`} className="card p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="chip bg-ink-100 text-ink-600">
                  {targetLabel(r.targetType)}
                </span>
                <span className="text-sm font-semibold text-ink-900">
                  {actionLabel(r.action)}
                </span>
              </div>
              <p className="mt-2 text-xs text-ink-500">
                {formatDate(r.createdAt, locale, DATE_TIME_OPTS)} · {t.auditLogAdminLabel}{" "}
                {r.adminId} · {r.targetType} {r.targetId}
              </p>
              {r.reason && (
                <p className="mt-2 whitespace-pre-line text-sm text-ink-600">
                  {t.auditLogReasonLabel}: {r.reason}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
