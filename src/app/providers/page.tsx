import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { categoryLabel } from "@/lib/constants";
import ProviderCard, { ProviderSummary } from "@/components/ProviderCard";
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
  const q = typeof params.q === "string" ? params.q.trim() : "";
  const category = typeof params.category === "string" ? params.category : "";
  const district = typeof params.district === "string" ? params.district : "";
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

  const [providers, total] = await Promise.all([
    db.provider.findMany({
      where,
      include: {
        user: { select: { name: true } },
        services: { orderBy: { price: "asc" }, take: 1 },
        photos: { take: 1, orderBy: { createdAt: "desc" } },
        reviews: { select: { rating: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    db.provider.count({ where }),
  ]);

  const results: ProviderSummary[] = providers.map((p) => ({
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
    rating: p.reviews.length
      ? p.reviews.reduce((s, r) => s + r.rating, 0) / p.reviews.length
      : null,
    reviewCount: p.reviews.length,
  }));

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function pageLink(target: number) {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (category) sp.set("category", category);
    if (district) sp.set("district", district);
    sp.set("page", String(target));
    return `/providers?${sp.toString()}`;
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-ink-900">
            {category ? categoryLabel(category) : "All Professionals"}
          </h1>
          <p className="mt-1 text-ink-500">
            {total} professional{total === 1 ? "" : "s"} found
            {district ? ` in ${district}` : " across Sri Lanka"}
          </p>
        </div>
      </div>

      <div className="mt-6">
        <FilterBar q={q} category={category} district={district} />
      </div>

      {results.length === 0 ? (
        <div className="card mt-8 flex flex-col items-center px-6 py-20 text-center">
          <span className="text-5xl">🔍</span>
          <h2 className="mt-4 text-lg font-semibold text-ink-900">
            No professionals found
          </h2>
          <p className="mt-1 max-w-sm text-sm text-ink-500">
            Try a different category or district, or clear your search.
          </p>
          <Link href="/providers" className="btn-secondary mt-6">
            Clear filters
          </Link>
        </div>
      ) : (
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((p) => (
            <ProviderCard key={p.id} p={p} />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-10 flex items-center justify-center gap-2">
          {page > 1 && (
            <Link href={pageLink(page - 1)} className="btn-secondary">
              ← Previous
            </Link>
          )}
          <span className="px-3 text-sm text-ink-500">
            Page {page} of {totalPages}
          </span>
          {page < totalPages && (
            <Link href={pageLink(page + 1)} className="btn-secondary">
              Next →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
