import Link from "next/link";
import { redirect } from "next/navigation";
import { FaArrowRight, FaUsers } from "@/components/icons";
import { apiJson } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { dict, categoryLabelLoc } from "@/lib/i18n";
import {
  normalizeAdminSort,
  normalizeStatusFilter,
  normalizeSuspendedFilter,
} from "@/lib/admin-list";
import { qualityChipClasses } from "@/lib/quality";
import Avatar from "@/components/Avatar";
import InView from "@/components/InView";
import PageHeader from "@/components/ui/PageHeader";
import StatReadout from "@/components/ui/StatReadout";
import EmptyState from "@/components/ui/EmptyState";
import AdminProviderActions from "@/components/admin/AdminProviderActions";
import AdminProvidersFilterBar from "@/components/admin/AdminProvidersFilterBar";
import type { AdminCategory } from "@/components/admin/AdminCategoryManager";

// Caching (#57): admin-only moderation view; edits must be visible on the
// next request — stays fully dynamic (no-store).
export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

// Admin listing as served by `GET /api/admin/providers` on the gateway
// (search/filter/sort/pagination, #224 — contact details and review/photo
// counts hydrated).
type AdminProviderRow = {
  id: string;
  category: string;
  city: string;
  avatarUrl: string | null;
  verificationStatus: string;
  suspended: boolean;
  user: { name: string; email: string };
  _count: { reviews: number; photos: number };
  quality: {
    qualityScore: number;
    rating: number;
    reviewCount: number;
    openReportCount: number;
  };
};

export default async function AdminProvidersPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "ADMIN") redirect("/");

  const params = await searchParams;
  const locale = await getLocale();
  const t = dict[locale].admin;

  const q = typeof params.q === "string" ? params.q.trim() : "";
  const category = typeof params.category === "string" ? params.category : "";
  const city = typeof params.city === "string" ? params.city.trim() : "";
  const status = normalizeStatusFilter(params.status);
  const suspended = normalizeSuspendedFilter(params.suspended);
  const sort = normalizeAdminSort(params.sort);
  const page = Math.max(1, Number(params.page) || 1);

  // Search, filtering, ranking and pagination all happen in provider-service;
  // the query params pass straight through the gateway.
  const query = new URLSearchParams();
  if (q) query.set("q", q);
  if (category) query.set("category", category);
  if (city) query.set("city", city);
  if (status) query.set("status", status);
  if (suspended) query.set("suspended", suspended);
  query.set("sort", sort);
  query.set("page", String(page));
  query.set("pageSize", String(PAGE_SIZE));

  const [listing, categoriesData] = await Promise.all([
    apiJson<{
      providers: AdminProviderRow[];
      total: number;
      page: number;
      pageSize: number;
    }>(`/api/admin/providers?${query.toString()}`),
    apiJson<{ categories: AdminCategory[] }>("/api/admin/categories"),
  ]);

  const providers = listing?.providers ?? [];
  const total = listing?.total ?? 0;
  const pageSize = listing?.pageSize ?? PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const categories = categoriesData?.categories ?? [];
  const hasFilters = Boolean(q || category || city || status || suspended);

  function pageLink(target: number) {
    const sp = new URLSearchParams(query);
    sp.set("page", String(target));
    return `/admin/providers?${sp.toString()}`;
  }

  return (
    <div>
      <PageHeader
        tag="REG"
        eyebrow={t.providersLink}
        title={t.providersTitle}
        status={t.providersSubtitle}
      >
        <StatReadout stats={[{ label: "TOTAL", value: total }]} />
      </PageHeader>

      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <AdminProvidersFilterBar
          q={q}
          category={category}
          city={city}
          status={status}
          suspended={suspended}
          sort={sort}
          categories={categories}
        />

        <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-400">
          {t.adminFound(total)}
        </p>

        {providers.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              icon={FaUsers}
              title={total === 0 && !hasFilters ? t.providersEmpty : t.adminNoResults}
            />
          </div>
        ) : (
          <div className="mt-4 tech-corners border border-ink-300 bg-surface">
            {/* Registry panel header */}
            <div className="flex items-center justify-between border-b border-ink-200 px-5 py-3">
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-400">
                {t.providersLink}
              </span>
              <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-400">
                <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-brand-600" />
                <span className="tabular-nums text-ink-600">{total}</span>
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
                      {String((page - 1) * pageSize + i + 1).padStart(2, "0")}
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
                        <span
                          className={`chip ${qualityChipClasses(p.quality.qualityScore)}`}
                          title={t.qualityScoreBreakdown(
                            p.quality.rating,
                            p.quality.reviewCount,
                            p.quality.openReportCount
                          )}
                        >
                          {t.qualityScoreLabel} {p.quality.qualityScore}
                        </span>
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

        {totalPages > 1 && (
          <div className="mt-10 flex items-center justify-center gap-2">
            {page > 1 && (
              <Link href={pageLink(page - 1)} className="btn-secondary">
                {dict[locale].browse.prev}
              </Link>
            )}
            <span className="px-3 text-sm text-ink-500">
              {dict[locale].browse.pageOf(page, totalPages)}
            </span>
            {page < totalPages && (
              <Link href={pageLink(page + 1)} className="btn-secondary">
                {dict[locale].browse.next}
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
