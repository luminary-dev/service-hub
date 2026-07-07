import Link from "next/link";
import { redirect } from "next/navigation";
import {
  FaBriefcase,
  FaCircleCheck,
  FaCircleXmark,
  FaClock,
  FaFlag,
  FaShieldHalved,
  FaTags,
  FaUsers,
} from "@/components/icons";
import { getSession } from "@/lib/auth";
import { isAdminRole } from "@/lib/roles";
import { getLocale } from "@/lib/locale";
import { dict } from "@/lib/i18n";
import { apiJson } from "@/lib/api";
import { formatNumber } from "@/lib/format";
import AdminDashboardCharts, {
  type CategoryStat,
  type SignupPoint,
} from "@/components/admin/AdminDashboardCharts";

// Caching (#57): admin-only moderation view; edits must be visible on the
// next request — stays fully dynamic (no-store).
export const dynamic = "force-dynamic";

// Dashboard metrics (#219). Three sources, gatewayed to the service that
// owns the data:
//  - provider-service `/api/admin/stats`: provider active/suspended counts,
//    pending verifications, its half of "open reports", category breakdown.
//  - review-service `/api/admin/review-stats`: the other half of "open
//    reports" (abuse reports on reviews).
//  - identity-service `/api/admin/signups`: daily signup counts (30 days),
//    split customers vs providers.
// All three degrade to null on failure — the page still renders with zeros
// rather than 500ing, same as the rest of the merged-source admin pages.
type ProviderStats = {
  providers: { active: number; suspended: number; total: number };
  pendingVerifications: number;
  openReports: number;
  categoryDistribution: CategoryStat[];
};

type ReviewStats = { openReports: number };

type SignupStats = {
  series: SignupPoint[];
  totals: { customers: number; providers: number };
};

export default async function AdminHomePage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!isAdminRole(session.role)) redirect("/");

  const [locale, providerStats, reviewStats, signupStats] = await Promise.all([
    getLocale(),
    apiJson<ProviderStats>("/api/admin/stats"),
    apiJson<ReviewStats>("/api/admin/review-stats"),
    apiJson<SignupStats>("/api/admin/signups"),
  ]);
  const t = dict[locale].admin;

  const openReports = (providerStats?.openReports ?? 0) + (reviewStats?.openReports ?? 0);
  const signupsTotal =
    (signupStats?.totals.customers ?? 0) + (signupStats?.totals.providers ?? 0);

  const stats = [
    { icon: FaUsers, value: signupsTotal, label: t.statSignups },
    {
      icon: FaShieldHalved,
      value: providerStats?.pendingVerifications ?? 0,
      label: t.statPendingVerifications,
    },
    { icon: FaFlag, value: openReports, label: t.statOpenReports },
    {
      icon: FaCircleCheck,
      value: providerStats?.providers.active ?? 0,
      label: t.statActiveProviders,
    },
    {
      icon: FaCircleXmark,
      value: providerStats?.providers.suspended ?? 0,
      label: t.statSuspendedProviders,
    },
  ];

  const cards = [
    {
      href: "/admin/providers",
      icon: FaUsers,
      title: t.providersLink,
      desc: t.providersDesc,
    },
    {
      href: "/admin/verifications",
      icon: FaShieldHalved,
      title: t.verificationsLink,
      desc: t.verificationsDesc,
    },
    {
      href: "/admin/categories",
      icon: FaTags,
      title: t.categoriesLink,
      desc: t.categoriesDesc,
    },
    {
      href: "/admin/reports",
      icon: FaFlag,
      title: t.reportsLink,
      desc: t.reportsDesc,
    },
    {
      href: "/admin/audit-log",
      icon: FaClock,
      title: t.auditLogLink,
      desc: t.auditLogDesc,
    },
    {
      href: "/admin/jobs",
      icon: FaBriefcase,
      title: t.jobsLink,
      desc: t.jobsDesc,
    },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight text-ink-900">
        {t.indexTitle}
      </h1>
      <p className="mt-1 text-ink-600">{t.indexSubtitle}</p>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-ink-900">{t.statsTitle}</h2>
        <p className="mt-0.5 text-sm text-ink-600">{t.statsSubtitle}</p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {stats.map((s) => (
            <div key={s.label} className="card p-5">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
                <s.icon className="h-4 w-4" />
              </span>
              <p className="mt-3 text-2xl font-semibold text-ink-900">
                {formatNumber(s.value, locale)}
              </p>
              <p className="mt-0.5 text-sm text-ink-600">{s.label}</p>
            </div>
          ))}
        </div>

        <div className="mt-5">
          <AdminDashboardCharts
            signups={signupStats?.series ?? []}
            categories={providerStats?.categoryDistribution ?? []}
          />
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold text-ink-900">{t.manageTitle}</h2>
        <div className="mt-4 grid gap-5 sm:grid-cols-2">
          {cards.map((c) => (
            <Link
              key={c.href}
              href={c.href}
              className="card group p-6 transition-[border-color,transform] duration-200 ease-snap hover:-translate-y-1 hover:border-brand-400"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                <c.icon className="h-5 w-5" />
              </span>
              <h2 className="mt-4 font-semibold text-ink-900 group-hover:text-brand-700">
                {c.title}
              </h2>
              <p className="mt-1 text-sm text-ink-600">{c.desc}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
