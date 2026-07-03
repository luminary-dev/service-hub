import { FaMagnifyingGlass } from "react-icons/fa6";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { dict, categoryLabelLoc } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";
import { normalizeSort, sortProviders } from "@/lib/sort";
import ProviderCard, { ProviderSummary } from "@/components/ProviderCard";
import FilterBar from "@/components/FilterBar";
import Link from "next/link";

type EnrichedSummary = ProviderSummary & {
  ratingSum: number;
  createdAt: Date;
};

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
  const q = typeof params.q === "string" ? params.q.trim() : "";
  const category = typeof params.category === "string" ? params.category : "";
  const district = typeof params.district === "string" ? params.district : "";
  const sort = normalizeSort(params.sort);
  const page = Math.max(1, Number(params.page) || 1);

  const where: Prisma.ProviderWhereInput = {
    ...(category ? { category } : {}),
    ...(district ? { district } : {}),
    ...(q
      ? {
          OR: [
            { headline: { contains: q } },
            { bio: { contains: q } },
            { city: { contains: q } },
            { user: { name: { contains: q } } },
            { services: { some: { title: { contains: q } } } },
          ],
        }
      : {}),
  };

  // Rating and starting price are derived from related rows, so we rank and
  // paginate in memory. Fine at the current scale; a DB-level ranking / search
  // index is tracked separately (see issue #56) for when the directory grows.
  const providers = await db.provider.findMany({
    where,
    include: {
      user: { select: { name: true } },
      services: { orderBy: { price: "asc" }, take: 1 },
      photos: { take: 1, orderBy: { createdAt: "desc" } },
      reviews: { select: { rating: true } },
    },
  });

  const enriched: EnrichedSummary[] = providers.map((p) => {
    const ratingSum = p.reviews.reduce((s, r) => s + r.rating, 0);
    return {
      id: p.id,
      name: p.user.name,
      category: p.category,
      headline: p.headline,
      district: p.district,
      city: p.city,
      experience: p.experience,
      available: p.available,
      avatarUrl: p.avatarUrl,
      coverPhoto: p.photos[0]?.url ?? null,
      fromPrice: p.services[0]?.price ?? null,
      fromPriceType: p.services[0]?.priceType ?? null,
      rating: p.reviews.length ? ratingSum / p.reviews.length : null,
      reviewCount: p.reviews.length,
      ratingSum,
      createdAt: p.createdAt,
    };
  });

  const total = enriched.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const results = sortProviders(enriched, sort).slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE
  );

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
        <FilterBar q={q} category={category} district={district} sort={sort} />
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
            <ProviderCard key={p.id} p={p} locale={locale} />
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
