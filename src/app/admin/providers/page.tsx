import Link from "next/link";
import { redirect } from "next/navigation";
import { FaArrowRight, FaUsers } from "@/components/icons";
import { apiJson } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { dict, categoryLabelLoc } from "@/lib/i18n";
import Avatar from "@/components/Avatar";
import InView from "@/components/InView";
import PageHeader from "@/components/ui/PageHeader";
import StatReadout from "@/components/ui/StatReadout";
import EmptyState from "@/components/ui/EmptyState";
import AdminProviderActions from "@/components/admin/AdminProviderActions";

// Caching (#57): admin-only moderation view; edits must be visible on the
// next request — stays fully dynamic (no-store).
export const dynamic = "force-dynamic";

// Admin listing as served by `GET /api/admin/providers` on the gateway
// (newest first, with contact details and review/photo counts hydrated).
type AdminProviderRow = {
  id: string;
  category: string;
  city: string;
  avatarUrl: string | null;
  verificationStatus: string;
  suspended: boolean;
  user: { name: string; email: string };
  _count: { reviews: number; photos: number };
};

export default async function AdminProvidersPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "ADMIN") redirect("/");

  const [locale, data] = await Promise.all([
    getLocale(),
    apiJson<{ providers: AdminProviderRow[] }>("/api/admin/providers"),
  ]);
  const providers = data?.providers ?? [];
  const t = dict[locale].admin;

  // Derived from the already-fetched listing — no extra requests.
  const verified = providers.filter(
    (p) => p.verificationStatus === "VERIFIED"
  ).length;
  const pending = providers.filter(
    (p) => p.verificationStatus === "PENDING"
  ).length;
  const suspended = providers.filter((p) => p.suspended).length;

  return (
    <div>
      <PageHeader
        tag="REG"
        eyebrow={t.providersLink}
        title={t.providersTitle}
        status={t.providersSubtitle}
      >
        <StatReadout
          stats={[
            { label: "TOTAL", value: providers.length },
            { label: "VERIFIED", value: verified },
            { label: "PENDING", value: pending },
            { label: "SUSPENDED", value: suspended },
          ]}
        />
      </PageHeader>

      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        {providers.length === 0 ? (
          <EmptyState icon={FaUsers} title={t.providersEmpty} />
        ) : (
          <div className="tech-corners border border-ink-300 bg-surface">
            {/* Registry panel header */}
            <div className="flex items-center justify-between border-b border-ink-200 px-5 py-3">
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-400">
                {t.providersLink}
              </span>
              <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-400">
                <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-brand-600" />
                <span className="tabular-nums text-ink-600">
                  {providers.length}
                </span>
              </span>
            </div>

            <InView as="ul" stagger className="divide-y divide-ink-200">
              {providers.map((p, i) => (
                <li
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-4 px-4 py-4 transition-colors duration-200 ease-snap hover:bg-ink-50 sm:px-5"
                >
                  <div className="flex min-w-0 items-center gap-4">
                    <span className="hidden font-mono text-[11px] tabular-nums text-ink-400 sm:block">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <Avatar name={p.user.name} url={p.avatarUrl} size={40} />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/admin/providers/${p.id}`}
                          className="font-semibold text-ink-900 hover:text-brand-700"
                        >
                          {p.user.name}
                        </Link>
                        {p.verificationStatus === "VERIFIED" && (
                          <span className="chip bg-brand-50 text-brand-700 ring-1 ring-brand-200">
                            {t.verifiedTag}
                          </span>
                        )}
                        {p.verificationStatus === "PENDING" && (
                          <span className="chip bg-amber-50 text-amber-700 ring-1 ring-amber-200">
                            {t.pendingTag}
                          </span>
                        )}
                        {p.suspended && (
                          <span className="chip bg-red-50 text-red-700 ring-1 ring-red-200">
                            {t.suspendedTag}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-xs text-ink-500">
                        <span>{categoryLabelLoc(p.category, locale)}</span>
                        <span aria-hidden className="text-ink-300">
                          ·
                        </span>
                        <span>{p.city}</span>
                        <span aria-hidden className="text-ink-300">
                          ·
                        </span>
                        <span>
                          <span className="tabular-nums text-ink-700">
                            {p._count.reviews}
                          </span>{" "}
                          {t.reviewsHeading.toLowerCase()},
                        </span>
                        <span>
                          <span className="tabular-nums text-ink-700">
                            {p._count.photos}
                          </span>{" "}
                          {t.photosHeading.toLowerCase()}
                        </span>
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <Link
                      href={`/admin/providers/${p.id}`}
                      className="group inline-flex items-center gap-1.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-brand-700 hover:text-brand-800"
                    >
                      {t.moderate}
                      <FaArrowRight className="h-3 w-3 transition-transform duration-200 ease-snap group-hover:translate-x-0.5" />
                    </Link>
                    <AdminProviderActions
                      providerId={p.id}
                      verified={p.verificationStatus === "VERIFIED"}
                      suspended={p.suspended}
                    />
                  </div>
                </li>
              ))}
            </InView>
          </div>
        )}
      </div>
    </div>
  );
}
