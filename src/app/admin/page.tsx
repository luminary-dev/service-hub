import Link from "next/link";
import { redirect } from "next/navigation";
import {
  FaArrowRight,
  FaBriefcase,
  FaClock,
  FaFlag,
  FaIdCard,
  FaShieldHalved,
  FaTags,
  FaUsers,
  type IconType,
} from "@/components/icons";
import { getSession } from "@/lib/auth";
import { isAdminRole } from "@/lib/roles";
import { getLocale } from "@/lib/locale";
import { dict } from "@/lib/i18n";
import NotificationBadge from "@/components/admin/NotificationBadge";
import type { NotificationQueue } from "@/lib/adminNotifications";
import { apiJson } from "@/lib/api";
import { formatNumber } from "@/lib/format";
import PageHeader from "@/components/ui/PageHeader";
import StatReadout from "@/components/ui/StatReadout";
import InView from "@/components/InView";
import AdminDashboardChartsLazy from "@/components/admin/AdminDashboardChartsLazy";
import type {
  CategoryStat,
  SignupPoint,
} from "@/components/admin/AdminDashboardCharts";

// Caching (#57): admin-only moderation view; edits must be visible on the
// next request — stays fully dynamic (no-store).
export const dynamic = "force-dynamic";

type Card = {
  href: string;
  icon: IconType;
  title: string;
  desc: string;
  // Which queue's notification badge (#233) to show on this card, if any.
  badgeQueue?: NotificationQueue;
};

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
    { value: signupsTotal, label: t.statSignups },
    { value: providerStats?.pendingVerifications ?? 0, label: t.statPendingVerifications },
    { value: openReports, label: t.statOpenReports },
    { value: providerStats?.providers.active ?? 0, label: t.statActiveProviders },
    { value: providerStats?.providers.suspended ?? 0, label: t.statSuspendedProviders },
  ];

  const cards: Card[] = [
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
      badgeQueue: "verifications",
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
      badgeQueue: "reports",
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
    {
      href: "/admin/users",
      icon: FaIdCard,
      title: t.usersLink,
      desc: t.usersDesc,
    },
  ];

  return (
    <div>
      <PageHeader
        tag="ADM"
        eyebrow={t.indexTitle}
        title={t.indexTitle}
        status={t.indexSubtitle}
      >
        <StatReadout stats={[{ label: "MODULES", value: cards.length }]} />
      </PageHeader>

      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <section>
          <h2 className="text-lg font-semibold text-ink-900">{t.statsTitle}</h2>
          <p className="mt-0.5 text-sm text-ink-600">{t.statsSubtitle}</p>

          <StatReadout
            className="mt-4 flex-wrap"
            stats={stats.map((s) => ({
              label: s.label,
              value: formatNumber(s.value, locale),
            }))}
          />

          <div className="mt-6">
            <AdminDashboardChartsLazy
              signups={signupStats?.series ?? []}
              categories={providerStats?.categoryDistribution ?? []}
            />
          </div>
        </section>

        <section className="mt-12">
          <h2 className="text-lg font-semibold text-ink-900">{t.manageTitle}</h2>
          <InView
            stagger
            className="mt-4 grid grid-cols-1 border-l border-t border-ink-200 sm:grid-cols-2"
          >
            {cards.map((c, i) => (
              <Link
                key={c.href}
                href={c.href}
                className="group relative flex items-start gap-4 overflow-hidden border-b border-r border-ink-200 bg-surface p-6 transition-colors duration-200 ease-snap hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-400"
              >
                {/* hover scan sheen */}
                <span className="scan-line pointer-events-none absolute inset-y-0 left-0 w-1/2 -skew-x-12 bg-gradient-to-r from-transparent via-brand-500/15 to-transparent" />
                {/* growing left accent bar */}
                <span className="absolute inset-y-0 left-0 w-[3px] origin-top scale-y-0 bg-brand-600 transition-transform duration-300 ease-snap group-hover:scale-y-100" />
                <span className="relative flex h-11 w-11 shrink-0 items-center justify-center border border-ink-300 bg-ink-50 transition-colors duration-300 group-hover:border-brand-600 group-hover:bg-brand-600">
                  <c.icon className="h-5 w-5 text-brand-700 transition-colors duration-300 group-hover:text-white" />
                </span>
                <span className="relative min-w-0 flex-1">
                  <span className="block font-mono text-[10px] uppercase tracking-wider text-ink-400 transition-colors duration-300 group-hover:text-brand-600">
                    AD-{String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="mt-0.5 flex items-center gap-1.5 font-semibold text-ink-900 transition-colors duration-300 group-hover:text-brand-700">
                    {c.title}
                    {c.badgeQueue && <NotificationBadge queue={c.badgeQueue} />}
                    <FaArrowRight className="h-3 w-3 -translate-x-1 opacity-0 transition-all duration-300 ease-snap group-hover:translate-x-0 group-hover:opacity-100" />
                  </span>
                  <span className="mt-1 block text-sm text-ink-600">{c.desc}</span>
                </span>
              </Link>
            ))}
          </InView>
        </section>
      </div>
    </div>
  );
}
