// Pure query-building for the /api/providers listing (#127/#128/#47) so the
// where-clause logic is unit-testable without a database.
//
// Search stays Prisma `contains` (ILIKE '%q%') — the pg_trgm GIN indexes added
// in migration 20260704210000_search_trgm turn those scans into index lookups,
// and trigram matching keeps working for partial words. A tsvector/websearch
// upgrade (relevance ranking, stemming) can slot in later behind the same
// endpoint without changing this contract.
//
// Category matching (#128): the caller resolves the query text against the
// Category table's labelEn/labelSi (Sinhala labels included, so "කාර්මික"
// works even though provider data is stored in English) and passes the
// matching slugs in; they join the OR as `category IN (...)`.
import type { Prisma } from "@prisma/client";

// The free-text search fragment: empty/whitespace queries match everything.
export function buildSearchWhere(
  q: string | null | undefined,
  categorySlugs: string[]
): Prisma.ProviderWhereInput {
  const query = q?.trim();
  if (!query) return {};
  return {
    OR: [
      { headline: { contains: query, mode: "insensitive" } },
      { bio: { contains: query, mode: "insensitive" } },
      { city: { contains: query, mode: "insensitive" } },
      { contactName: { contains: query, mode: "insensitive" } },
      { services: { some: { title: { contains: query, mode: "insensitive" } } } },
      ...(categorySlugs.length > 0
        ? [{ category: { in: categorySlugs } }]
        : []),
    ],
  };
}

export type BrowseFilters = {
  q?: string | null;
  categorySlugs?: string[];
  category?: string | null;
  district?: string | null;
  // Advanced filters (#47). A provider matches a price range when ANY of its
  // services is priced inside it.
  priceMin?: number | null;
  priceMax?: number | null;
  availableOnly?: boolean;
};

// The full listing where-clause (minus the rating filter, which is applied
// after S2S rating hydration — ratings are derived data owned by
// review-service, consistent with the existing in-memory ranking approach).
// `now` is injectable for tests; availableOnly matches the effective
// availability rule in lib/availability.ts: available AND (awayUntil is null
// OR awayUntil <= now) — a provider away until a future date (#49) is
// unavailable. The away OR lives under AND so it can't clobber the search OR.
export function buildBrowseWhere(
  f: BrowseFilters,
  now: Date = new Date()
): Prisma.ProviderWhereInput {
  const price: Prisma.FloatFilter = {
    ...(f.priceMin != null ? { gte: f.priceMin } : {}),
    ...(f.priceMax != null ? { lte: f.priceMax } : {}),
  };
  return {
    suspended: false,
    ...(f.category ? { category: f.category } : {}),
    ...(f.district ? { district: f.district } : {}),
    ...(f.availableOnly
      ? {
          available: true,
          AND: [{ OR: [{ awayUntil: null }, { awayUntil: { lte: now } }] }],
        }
      : {}),
    ...(f.priceMin != null || f.priceMax != null
      ? { services: { some: { price } } }
      : {}),
    ...buildSearchWhere(f.q, f.categorySlugs ?? []),
  };
}
