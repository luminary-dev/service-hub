import Link from "next/link";
import { redirect } from "next/navigation";
import { apiJson } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { dict } from "@/lib/i18n";
import { formatDate, formatLKR } from "@/lib/format";
import TransactionActions from "@/components/admin/TransactionActions";

// Caching (#57): admin-only moderation view; edits must be visible on the
// next request — stays fully dynamic (no-store).
export const dynamic = "force-dynamic";

// Billing v1 (#221): flat 10% commission on completed jobs — a default
// starting point to unblock admin visibility, not a finalized pricing
// decision. Transaction rows are served by job-service (GET
// /api/admin/transactions), with job title and provider name hydrated for
// display.
type TransactionStatus = "PENDING" | "PAID" | "REFUNDED";

type Transaction = {
  id: string;
  jobRequestId: string;
  providerId: string;
  amount: number;
  commissionRate: number;
  commissionAmount: number;
  status: TransactionStatus;
  createdAt: string;
  jobTitle: string | null;
  providerName: string | null;
};

const STATUS_FILTERS = ["ALL", "PENDING", "PAID", "REFUNDED"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

function parseStatusFilter(raw: string | undefined): StatusFilter {
  return (STATUS_FILTERS as readonly string[]).includes(raw ?? "")
    ? (raw as StatusFilter)
    : "ALL";
}

export default async function AdminBillingPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "ADMIN") redirect("/");

  const filter = parseStatusFilter((await searchParams).status);
  const locale = await getLocale();
  const t = dict[locale].admin;

  // Totals always reflect every transaction, independent of the list filter
  // below (a running summary, not a filtered one).
  const [allData, filteredData] = await Promise.all([
    apiJson<{ transactions: Transaction[] }>("/api/admin/transactions"),
    filter === "ALL"
      ? Promise.resolve(null)
      : apiJson<{ transactions: Transaction[] }>(
          `/api/admin/transactions?status=${filter}`
        ),
  ]);
  const all = allData?.transactions ?? [];
  const rows = filter === "ALL" ? all : (filteredData?.transactions ?? []);

  const sum = (list: Transaction[]) =>
    list.reduce((total, tx) => total + tx.commissionAmount, 0);
  const totalCommission = sum(all);
  const pendingCommission = sum(all.filter((tx) => tx.status === "PENDING"));
  const paidCommission = sum(all.filter((tx) => tx.status === "PAID"));

  const statusTag = (status: TransactionStatus) => {
    if (status === "PAID") {
      return (
        <span className="chip bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
          {t.paidTag}
        </span>
      );
    }
    if (status === "REFUNDED") {
      return <span className="chip bg-ink-100 text-ink-500">{t.refundedTag}</span>;
    }
    return (
      <span className="chip bg-amber-50 text-amber-700 ring-1 ring-amber-200">
        {t.pendingPaymentTag}
      </span>
    );
  };

  const filterLabel: Record<StatusFilter, string> = {
    ALL: t.billingFilterAll,
    PENDING: t.pendingPaymentTag,
    PAID: t.paidTag,
    REFUNDED: t.refundedTag,
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight text-ink-900">
        {t.billingTitle}
      </h1>
      <p className="mt-1 text-ink-600">{t.billingSubtitle}</p>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <div className="card p-5">
          <p className="text-sm text-ink-500">{t.billingTotalCommission}</p>
          <p className="mt-1 text-2xl font-semibold text-ink-900">
            {formatLKR(totalCommission, locale)}
          </p>
        </div>
        <div className="card p-5">
          <p className="text-sm text-ink-500">{t.billingPendingCommission}</p>
          <p className="mt-1 text-2xl font-semibold text-amber-700">
            {formatLKR(pendingCommission, locale)}
          </p>
        </div>
        <div className="card p-5">
          <p className="text-sm text-ink-500">{t.billingPaidCommission}</p>
          <p className="mt-1 text-2xl font-semibold text-emerald-700">
            {formatLKR(paidCommission, locale)}
          </p>
        </div>
      </div>

      <div className="mt-8 flex flex-wrap gap-2">
        {STATUS_FILTERS.map((s) => (
          <Link
            key={s}
            href={s === "ALL" ? "/admin/billing" : `/admin/billing?status=${s}`}
            className={`chip transition ${
              filter === s
                ? "bg-brand-50 text-brand-700 ring-1 ring-brand-200"
                : "bg-ink-100 text-ink-600 hover:bg-ink-200"
            }`}
          >
            {filterLabel[s]}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="card mt-6 px-6 py-16 text-center text-sm text-ink-500">
          {t.billingEmpty}
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {rows.map((tx) => (
            <li
              key={tx.id}
              className="card flex flex-wrap items-center justify-between gap-4 p-4"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-ink-900">
                    {tx.jobTitle ?? t.billingJobUnknown}
                  </span>
                  {statusTag(tx.status)}
                </div>
                <p className="mt-1 text-sm text-ink-600">
                  {t.billingProvider}: {tx.providerName ?? t.billingProviderUnknown}
                </p>
                <p className="mt-1 text-xs text-ink-500">
                  {formatDate(tx.createdAt, locale)} ·{" "}
                  {t.billingAmount}: {formatLKR(tx.amount, locale)} ·{" "}
                  {t.billingCommission}:{" "}
                  {formatLKR(tx.commissionAmount, locale)} (
                  {Math.round(tx.commissionRate * 100)}%)
                </p>
              </div>
              <TransactionActions transactionId={tx.id} status={tx.status} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
