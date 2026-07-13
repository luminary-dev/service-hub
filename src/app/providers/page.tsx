import type { Metadata } from "next";
import { FaMagnifyingGlass } from "@/components/icons";
import { apiJson } from "@/lib/api";
import { fetchCategoryOptions } from "@/lib/categories-server";
import { dict, categoryLabelLoc } from "@/lib/i18n";
import { languageAlternates, localizedHref } from "@/lib/links";
import { getLocale, getUrlLocale } from "@/lib/locale";
import { siteOpenGraph } from "@/lib/seo";
import { normalizeSort } from "@/lib/sort-keys";
import { getSession } from "@/lib/auth";
import ProviderCard, { ProviderCardDTO } from "@/components/ProviderCard";
import CategoryIcon from "@/components/CategoryIcon";
import FilterBar from "@/components/FilterBar";
import SaveSearchButton from "@/components/SaveSearchButton";
import InView from "@/components/InView";
import { DISTRICTS } from "@/lib/constants";
import Link from "next/link";

// Caching (#57): public-but-fresh. No force-dynamic - the page renders per
// request (searchParams + locale/session cookies), but the search results
// come from the Data Cache with a 60-second revalidate. Only bounded filter
// combinations are cached (see `cacheable` below, #377); new/edited profiles
// show up in browse within a minute, which is plenty for a directory listing.
const PAGE_SIZE = 12;

// Shown as suggestions when a search or filter combination yields no results.
const POPULAR_CATEGORIES = [
  "electrician",
  "plumber",
  "mechanic",
  "ac-repair",
  "painter",
  "cleaning",
] as const;

// Keep only digit strings in the URL/state for the rupee inputs - the service
// does the authoritative normalization (normalizeListQuery).
function numericParam(v: string | string[] | undefined): string {
  return typeof v === "string" && /^\d+$/.test(v.trim()) ? v.trim() : "";
}

// hreflang pairs (#67). The category filter is the indexed dimension (the
// sitemap lists /providers?category=… pages), so it stays in the canonical /
// alternate URLs; the remaining filters (q, price, rating, page…) are search
// permutations that canonicalize to the category listing.
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}): Promise<Metadata> {
  const [params, urlLocale, locale] = await Promise.all([
    searchParams,
    getUrlLocale(),
    getLocale(),
  ]);
  const category =
    typeof params.category === "string" && params.category
      ? params.category
      : "";
  const district =
    typeof params.district === "string" && params.district
      ? params.district
      : "";
  const canonical = category
    ? `?category=${encodeURIComponent(category)}`
    : "";
  const alternates = languageAlternates(`/providers${canonical}`, urlLocale);
  // og:url mirrors the canonical (#379) — search permutations share the
  // category listing's URL, exactly like the alternates above.
  const openGraph = siteOpenGraph(locale, urlLocale, `/providers${canonical}`);

  // Default listing (no filters) keeps the generic root title/description via
  // the layout — only category/district permutations get a bespoke, keyword-
  // rich title so /providers?category=… pages stop sharing one <title> (#513).
  if (!category && !district) {
    return { alternates, openGraph };
  }

  const t = dict[locale];
  const categoryLabel = category ? categoryLabelLoc(category, locale) : null;
  const title = t.browse.metaTitle(categoryLabel, district || null);
  const description = t.browse.metaDesc(categoryLabel, district || null);
  return {
    title,
    description,
    alternates,
    openGraph: { ...openGraph, title, description },
  };
}

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
  // Advanced filters (#47) - shareable via the URL like every other filter.
  const priceMin = numericParam(params.priceMin);
  const priceMax = numericParam(params.priceMax);
  const ratingMin = numericParam(params.ratingMin);
  const availableOnly = params.availableOnly === "1";

  // Search, filtering, ranking and pagination all happen in provider-service;
  // the query params pass straight through the gateway.
  const query = new URLSearchParams();
  if (q) query.set("q", q);
  if (category) query.set("category", category);
  if (district) query.set("district", district);
  if (priceMin) query.set("priceMin", priceMin);
  if (priceMax) query.set("priceMax", priceMax);
  if (ratingMin) query.set("ratingMin", ratingMin);
  if (availableOnly) query.set("availableOnly", "1");
  query.set("sort", sort);
  query.set("page", String(page));

  // Data Cache entries are keyed by the full fetch URL, so only queries drawn
  // from a bounded key space (known category/district, normalized sort, capped
  // page) are cached — free-text q, arbitrary numeric filters or made-up slugs
  // would let anyone mint unlimited cache entries on disk (#377). Unbounded
  // permutations still render fine, just without the shared cache.
  const categories = await fetchCategoryOptions({ revalidate: 300 });
  const cacheable =
    !q &&
    !priceMin &&
    !priceMax &&
    !ratingMin &&
    page <= 50 &&
    (!category || categories.some((c) => c.slug === category)) &&
    (!district || (DISTRICTS as readonly string[]).includes(district));

  const listing = await apiJson<{
    providers: ProviderCardDTO[];
    total: number;
    page: number;
    pageSize: number;
  }>(`/api/providers?${query.toString()}`, cacheable ? { revalidate: 60 } : undefined);

  const results = listing?.providers ?? [];
  const total = listing?.total ?? 0;
  const pageSize = listing?.pageSize ?? PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function pageLink(target: number) {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (category) sp.set("category", category);
    if (district) sp.set("district", district);
    if (priceMin) sp.set("priceMin", priceMin);
    if (priceMax) sp.set("priceMax", priceMax);
    if (ratingMin) sp.set("ratingMin", ratingMin);
    if (availableOnly) sp.set("availableOnly", "1");
    if (sort !== "recommended") sp.set("sort", sort);
    sp.set("page", String(target));
    return localizedHref(`/providers?${sp.toString()}`, locale);
  }

  const stats: [string, number][] = [
    [t.browse.stats.total, total],
    [t.browse.stats.trades, categories.length],
    [t.browse.stats.districts, DISTRICTS.length],
  ];

  // Saved searches (#516): customers can persist the primary filters
  // (q/category/district) and get emailed when a new professional matches.
  const canSaveSearch =
    session?.role === "CUSTOMER" && Boolean(q || category || district);
  const defaultSearchName = [
    q,
    category ? categoryLabelLoc(category, locale) : "",
    district,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div>
      {/* Registry header band */}
      <section className="blueprint-grid border-b border-ink-300 bg-ink-50">
        <div className="mx-auto flex max-w-6xl flex-wrap items-end justify-between gap-8 px-4 py-10 sm:px-6">
          <div>
            <div className="flex items-center gap-2.5 font-mono text-[11px] font-semibold uppercase tracking-[0.14em]">
              <span className="rounded-sm bg-brand-700 px-1.5 py-0.5 text-white dark:text-ink-50">
                REG
              </span>
              <span className="text-ink-500">{t.nav.find}</span>
            </div>
            <h1 className="mt-3 text-4xl font-bold tracking-tight text-ink-900 sm:text-5xl">
              {category ? categoryLabelLoc(category, locale) : t.browse.title}
            </h1>
            <p className="mt-2 flex items-center gap-2 font-mono text-sm text-ink-500">
              <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-brand-600" />
              {t.browse.found(total, district || null)}
            </p>
          </div>
          <dl className="flex gap-3">
            {stats.map(([label, n]) => (
              <div
                key={label}
                className="tech-corners min-w-[92px] border border-ink-300 bg-surface px-4 py-3"
              >
                <dd className="font-mono text-2xl font-bold tabular-nums text-ink-900">
                  {String(n).padStart(2, "0")}
                </dd>
                <dt className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-400">
                  {label}
                </dt>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <FilterBar
          q={q}
          category={category}
          district={district}
          sort={sort}
          priceMin={priceMin}
          priceMax={priceMax}
          ratingMin={ratingMin}
          availableOnly={availableOnly}
          categories={categories}
        />

      {canSaveSearch && (
        <div className="mt-4">
          <SaveSearchButton
            query={q}
            category={category}
            district={district}
            defaultName={defaultSearchName}
          />
        </div>
      )}

      {results.length === 0 ? (
        <div className="card mt-8 flex flex-col items-center px-6 py-16 text-center">
          <FaMagnifyingGlass className="h-12 w-12 text-ink-300" />
          <h2 className="mt-4 text-lg font-semibold text-ink-900">
            {t.browse.emptyTitle}
          </h2>
          <p className="mt-1 max-w-sm text-sm text-ink-500">
            {t.browse.emptyBody}
          </p>
          <Link href={localizedHref("/providers", locale)} className="btn-secondary mt-6">
            {t.browse.clear}
          </Link>
          <p className="mt-8 text-sm font-medium text-ink-700">
            {t.browse.emptyPopular}
          </p>
          <div className="mt-3 flex max-w-lg flex-wrap justify-center gap-2">
            {POPULAR_CATEGORIES.map((slug) => (
              <Link
                key={slug}
                href={localizedHref(`/providers?category=${slug}`, locale)}
                className="chip border border-ink-200 bg-surface !px-3 !py-1.5 text-ink-700 transition-[border-color,color] duration-200 ease-snap hover:border-brand-400 hover:text-brand-700"
              >
                <CategoryIcon slug={slug} className="h-3.5 w-3.5" />
                {categoryLabelLoc(slug, locale)}
              </Link>
            ))}
          </div>
        </div>
      ) : (
        <InView stagger className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((p) => (
            <ProviderCard
              key={p.id}
              p={p}
              locale={locale}
              showFavorite={!!session}
              favorited={favoriteIds.has(p.id)}
            />
          ))}
        </InView>
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
    </div>
  );
}
