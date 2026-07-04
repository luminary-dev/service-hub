import { FaMagnifyingGlass } from "react-icons/fa6";
import { apiJson } from "@/lib/api";
import { fetchCategoryOptions } from "@/lib/categories-server";
import { dict, categoryLabelLoc } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";
import { normalizeSort } from "@/lib/sort-keys";
import { getSession } from "@/lib/auth";
import ProviderCard, { ProviderCardDTO } from "@/components/ProviderCard";
import FilterBar from "@/components/FilterBar";
import Link from "next/link";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 12;

export default async function ProvidersPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const locale = await getLocale();
  const t = dict[locale];
  const session = await getSession();
  const favorites = session
    ? await apiJson<{ providerIds: string[] }>("/api/favorites")
    : null;
  const favoriteIds = new Set(favorites?.providerIds ?? []);
  const q = typeof params.q === "string" ? params.q.trim() : "";
  const category = typeof params.category === "string" ? params.category : "";
  const district = typeof params.district === "string" ? params.district : "";
  const sort = normalizeSort(params.sort);
  const page = Math.max(1, Number(params.page) || 1);

  // Search, filtering, ranking and pagination all happen in provider-service;
  // the query params pass straight through the gateway.
  const query = new URLSearchParams();
  if (q) query.set("q", q);
  if (category) query.set("category", category);
  if (district) query.set("district", district);
  query.set("sort", sort);
  query.set("page", String(page));

  const [listing, categories] = await Promise.all([
    apiJson<{
      providers: ProviderCardDTO[];
      total: number;
      page: number;
      pageSize: number;
    }>(`/api/providers?${query.toString()}`),
    fetchCategoryOptions(),
  ]);

  const results = listing?.providers ?? [];
  const total = listing?.total ?? 0;
  const pageSize = listing?.pageSize ?? PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function pageLink(target: number) {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (category) sp.set("category", category);
    if (district) sp.set("district", district);
    if (sort !== "recommended") sp.set("sort", sort);
    sp.set("page", String(target));
    return `/providers?${sp.toString()}`;
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-ink-900">
            {category ? categoryLabelLoc(category, locale) : t.browse.title}
          </h1>
          <p className="mt-1 text-ink-600">
            {t.browse.found(total, district || null)}
          </p>
        </div>
      </div>

      <div className="mt-6">
        <FilterBar
          q={q}
          category={category}
          district={district}
          sort={sort}
          categories={categories}
        />
      </div>

      {results.length === 0 ? (
        <div className="card mt-8 flex flex-col items-center px-6 py-20 text-center">
          <FaMagnifyingGlass className="h-12 w-12 text-ink-300" />
          <h2 className="mt-4 text-lg font-semibold text-ink-900">
            {t.browse.emptyTitle}
          </h2>
          <p className="mt-1 max-w-sm text-sm text-ink-500">
            {t.browse.emptyBody}
          </p>
          <Link href="/providers" className="btn-secondary mt-6">
            {t.browse.clear}
          </Link>
        </div>
      ) : (
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((p) => (
            <ProviderCard
              key={p.id}
              p={p}
              locale={locale}
              showFavorite={!!session}
              favorited={favoriteIds.has(p.id)}
            />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-10 flex items-center justify-center gap-2">
          {page > 1 && (
            <Link href={pageLink(page - 1)} className="btn-secondary">
              {t.browse.prev}
            </Link>
          )}
          <span className="px-3 text-sm text-ink-500">
            {t.browse.pageOf(page, totalPages)}
          </span>
          {page < totalPages && (
            <Link href={pageLink(page + 1)} className="btn-secondary">
              {t.browse.next}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
