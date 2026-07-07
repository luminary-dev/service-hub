import Link from "next/link";
import { redirect } from "next/navigation";
import { apiJson } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { dict, categoryLabelLoc } from "@/lib/i18n";
import {
  normalizeAdminSort,
  normalizeStatusFilter,
  normalizeSuspendedFilter,
} from "@/lib/admin-list";
import Avatar from "@/components/Avatar";
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

  function pageLink(target: number) {
    const sp = new URLSearchParams(query);
    sp.set("page", String(target));
    return `/admin/providers?${sp.toString()}`;
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight text-ink-900">
        {t.providersTitle}
      </h1>
      <p className="mt-1 text-ink-600">{t.providersSubtitle}</p>

      <div className="mt-6">
        <AdminProvidersFilterBar
          q={q}
          category={category}
          city={city}
          status={status}
          suspended={suspended}
          sort={sort}
          categories={categories}
        />
      </div>

      <p className="mt-4 text-sm text-ink-500">{t.adminFound(total)}</p>

      {providers.length === 0 ? (
        <div className="card mt-4 px-6 py-16 text-center text-sm text-ink-500">
          {total === 0 && !q && !category && !city && !status && !suspended
            ? t.providersEmpty
            : t.adminNoResults}
        </div>
      ) : (
      <ul className="mt-4 space-y-3">
        {providers.map((p) => (
          <li
            key={p.id}
            className="card flex flex-wrap items-center justify-between gap-4 p-4"
          >
            <div className="flex items-center gap-3">
              <Avatar name={p.user.name} url={p.avatarUrl} size={40} />
              <div>
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
                <p className="text-sm text-ink-500">
                  {categoryLabelLoc(p.category, locale)} · {p.city} ·{" "}
                  {p._count.reviews} {t.reviewsHeading.toLowerCase()},{" "}
                  {p._count.photos} {t.photosHeading.toLowerCase()}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Link
                href={`/admin/providers/${p.id}`}
                className="text-sm font-medium text-brand-700 hover:text-brand-800"
              >
                {t.moderate}
              </Link>
              <AdminProviderActions
                providerId={p.id}
                verified={p.verificationStatus === "VERIFIED"}
                suspended={p.suspended}
              />
            </div>
          </li>
        ))}
      </ul>
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
  );
}
