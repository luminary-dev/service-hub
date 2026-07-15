// DB-side query building for the public `/api/providers` directory (#748).
//
// The old browse hydrated up to 1000 candidate rows, fanned a per-request rating
// aggregation out to review-service, then filtered/sorted/paginated (and counted
// `total`) in memory — so deep pages and counts silently broke past the cap and
// every directory view cost several S2S round-trips. Now that ratingAvg/
// ratingCount are denormalized onto Provider, the whole thing runs in Postgres:
// this module builds the parameterized SQL for the ordered, paginated id slice
// and the matching `total` count. The route hydrates the card DTOs for that id
// slice with a normal Prisma `findMany` (single-sourced card shape), so no rating
// fan-out happens on the hot path.
//
// The WHERE mirrors lib/search.ts's buildBrowseWhere (kept as the Prisma form for
// the single-row saved-search matcher) plus the ratingMin filter, which used to be
// applied in memory after S2S hydration and is now a column predicate. Kept in
// raw SQL because two of the sorts can't be expressed with Prisma orderBy: `price`
// orders by the MIN of a to-many relation, and `recommended` (the default) orders
// by a computed Bayesian + recency + verified score.
import { Prisma } from "@prisma/client";
import {
  PRIOR_COUNT,
  PRIOR_MEAN,
  RECENCY_HALFLIFE_DAYS,
  RECENCY_WEIGHT,
  VERIFIED_BOOST,
  type SortKey,
} from "./sort";

export type BrowseSqlFilters = {
  q?: string | null;
  // Category slugs resolved from the free-text query against the Category
  // labels (en/si) — joined into the search OR as `category IN (...)`.
  categorySlugs?: string[];
  category?: string | null;
  district?: string | null;
  priceMin?: number | null;
  priceMax?: number | null;
  availableOnly?: boolean;
  // Minimum rating in [1,5]; a provider with no reviews (ratingCount 0) is
  // excluded by any minimum, matching the old `rating !== null` in-memory filter.
  ratingMin?: number | null;
};

// ILIKE pattern for a free-text term. Matches the old Prisma `contains` behavior
// (Postgres treats % / _ in the value as wildcards; neither layer escapes them).
function likePattern(q: string): string {
  return `%${q}%`;
}

// The browse WHERE, as a raw-SQL fragment over `Provider p`. Returned without a
// leading `WHERE` so callers can drop it straight after `WHERE`.
export function browseWhereSql(
  f: BrowseSqlFilters,
  now: Date = new Date()
): Prisma.Sql {
  const conds: Prisma.Sql[] = [Prisma.sql`p."suspended" = false`];

  if (f.category) {
    conds.push(Prisma.sql`p."category" = ${f.category}`);
  }
  // Multi-district service area (#502): a district filter matches any provider
  // whose served set contains it, backed by the GIN index on serviceDistricts.
  if (f.district) {
    conds.push(Prisma.sql`${f.district} = ANY(p."serviceDistricts")`);
  }
  // Effective availability (#49): available AND (no away date OR it has passed).
  if (f.availableOnly) {
    conds.push(
      Prisma.sql`p."available" = true AND (p."awayUntil" IS NULL OR p."awayUntil" <= ${now})`
    );
  }
  // A provider matches a price range when ANY of its services is priced inside it.
  if (f.priceMin != null || f.priceMax != null) {
    const priceConds: Prisma.Sql[] = [];
    if (f.priceMin != null) priceConds.push(Prisma.sql`s."price" >= ${f.priceMin}`);
    if (f.priceMax != null) priceConds.push(Prisma.sql`s."price" <= ${f.priceMax}`);
    conds.push(
      Prisma.sql`EXISTS (SELECT 1 FROM "Service" s WHERE s."providerId" = p."id" AND ${Prisma.join(
        priceConds,
        " AND "
      )})`
    );
  }
  // ratingMin (#47): now a column predicate. No-review providers are excluded.
  if (f.ratingMin != null) {
    conds.push(Prisma.sql`p."ratingCount" > 0 AND p."ratingAvg" >= ${f.ratingMin}`);
  }

  const query = f.q?.trim();
  if (query) {
    const pat = likePattern(query);
    const ors: Prisma.Sql[] = [
      Prisma.sql`p."headline" ILIKE ${pat}`,
      Prisma.sql`p."bio" ILIKE ${pat}`,
      // Bilingual pitch (#515): a Sinhala query ILIKE-matches the optional
      // Sinhala headline/bio too.
      Prisma.sql`p."headlineSi" ILIKE ${pat}`,
      Prisma.sql`p."bioSi" ILIKE ${pat}`,
      Prisma.sql`p."city" ILIKE ${pat}`,
      Prisma.sql`p."contactName" ILIKE ${pat}`,
      Prisma.sql`EXISTS (SELECT 1 FROM "Service" s WHERE s."providerId" = p."id" AND s."title" ILIKE ${pat})`,
    ];
    // Category label match (#128): the caller resolves the query text to slugs.
    if (f.categorySlugs && f.categorySlugs.length > 0) {
      ors.push(Prisma.sql`p."category" = ANY(${f.categorySlugs})`);
    }
    conds.push(Prisma.sql`(${Prisma.join(ors, " OR ")})`);
  }

  return Prisma.join(conds, " AND ");
}

// The Bayesian + recency + verified "recommended" score, mirroring
// recommendedScore's former in-memory form (constants shared from lib/sort.ts).
// ratingSum = ratingAvg * ratingCount; recency decays over the age in days.
function recommendedScoreSql(now: Date): Prisma.Sql {
  return Prisma.sql`(
    (p."ratingAvg" * p."ratingCount" + ${PRIOR_MEAN} * ${PRIOR_COUNT})
      / (p."ratingCount" + ${PRIOR_COUNT})
    + ${RECENCY_WEIGHT}
      * exp(- (EXTRACT(EPOCH FROM (${now}::timestamptz - p."createdAt")) / 86400.0)
            / ${RECENCY_HALFLIFE_DAYS})
    + CASE WHEN p."verificationStatus" = 'VERIFIED' THEN ${VERIFIED_BOOST} ELSE 0 END
  )`;
}

// ORDER BY fragment (without the leading `ORDER BY`). Tiebreakers mirror the old
// comparators: unrated (ratingAvg 0) sorts last on rating, no service price sorts
// last on price, and newest-first is the final tiebreaker everywhere.
export function browseOrderBySql(
  sort: SortKey,
  now: Date = new Date()
): Prisma.Sql {
  const newest = Prisma.sql`p."createdAt" DESC`;
  switch (sort) {
    case "rating":
      return Prisma.sql`p."ratingAvg" DESC, p."ratingCount" DESC, ${newest}`;
    case "reviews":
      return Prisma.sql`p."ratingCount" DESC, p."ratingAvg" DESC, ${newest}`;
    case "price":
      return Prisma.sql`(SELECT MIN(s."price") FROM "Service" s WHERE s."providerId" = p."id") ASC NULLS LAST, p."ratingAvg" DESC, ${newest}`;
    case "experience":
      return Prisma.sql`p."experience" DESC, p."ratingAvg" DESC, ${newest}`;
    case "newest":
      return newest;
    case "recommended":
    default:
      return Prisma.sql`${recommendedScoreSql(now)} DESC, ${newest}`;
  }
}

// The ordered, paginated id slice for a browse page.
export function browseIdsQuery(
  f: BrowseSqlFilters,
  sort: SortKey,
  limit: number,
  offset: number,
  now: Date = new Date()
): Prisma.Sql {
  return Prisma.sql`SELECT p."id" FROM "Provider" p WHERE ${browseWhereSql(
    f,
    now
  )} ORDER BY ${browseOrderBySql(sort, now)} LIMIT ${limit} OFFSET ${offset}`;
}

// The real `total` for the same filter set — computed DB-side (no cap).
export function browseCountQuery(
  f: BrowseSqlFilters,
  now: Date = new Date()
): Prisma.Sql {
  return Prisma.sql`SELECT COUNT(*)::int AS count FROM "Provider" p WHERE ${browseWhereSql(
    f,
    now
  )}`;
}
