// Pure SQL-fragment builders for the search query plane, kept side-effect
// free so the WHERE/ORDER BY logic is unit-testable without a database.
//
// Parity contract (RFC §5.1/§7 phase 2): for the browse-compatible params the
// WHERE clause must select exactly the rows provider-service's buildBrowseWhere
// selects, and each ORDER BY must reproduce lib/sort.ts's comparators — the
// e2e parity check (scripts/e2e-smoke.sh) shadow-compares the two endpoints.
// The tsvector arms are additive (stemmed matches browse's ILIKE can't make),
// so a free-text search may return a SUPERSET of browse for stemmed words;
// every ILIKE match is still included via the trigram fallback arm.
import { Prisma } from "@prisma/client";
import type { GeoPoint, SortKey } from "./query";

// Recommended-sort constants — lockstep with provider-service's lib/sort.ts
// (Bayesian prior toward 4.0 over 3 pseudo-reviews, a 45-day-halflife recency
// boost, and a small verified boost).
const PRIOR_COUNT = 3;
const PRIOR_MEAN = 4.0;
const RECENCY_WEIGHT = 0.6;
const RECENCY_HALFLIFE_DAYS = 45;
const VERIFIED_BOOST = 0.75;

export type SearchFilters = {
  q?: string | null;
  // Category slugs whose EN/SI label matched the free text (#128) — resolved
  // by the caller against provider-service's category list; they join the
  // free-text OR as `category IN (...)`.
  categorySlugs?: string[];
  category?: string | null;
  district?: string | null;
  priceMin?: number | null;
  priceMax?: number | null;
  ratingMin?: number | null;
  availableOnly?: boolean;
  point?: GeoPoint | null;
  radiusKm?: number | null;
};

// Escape LIKE wildcards the way Prisma's `contains` does, so a literal % or _
// in a query can't widen the match.
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (m) => `\\${m}`);
}

// The WGS84 geography point for ST_DWithin / ST_Distance / KNN ordering.
export function pointSql(point: GeoPoint): Prisma.Sql {
  return Prisma.sql`ST_SetSRID(ST_MakePoint(${point.lng}, ${point.lat}), 4326)::geography`;
}

// The free-text OR (parity with buildSearchWhere + the additive FTS arms).
function freeTextSql(q: string, categorySlugs: string[]): Prisma.Sql {
  const like = `%${escapeLike(q)}%`;
  const arms: Prisma.Sql[] = [
    // FTS first (§6): stemming + web-search operators for English, `simple`
    // tokenization for Sinhala. websearch_to_tsquery never throws on user text.
    Prisma.sql`"tsv_en" @@ websearch_to_tsquery('english', ${q})`,
    Prisma.sql`"tsv_si" @@ websearch_to_tsquery('simple', ${q})`,
    // Trigram/ILIKE fallback — today's browse behavior, preserved exactly.
    Prisma.sql`"headline" ILIKE ${like}`,
    Prisma.sql`"bio" ILIKE ${like}`,
    Prisma.sql`"headlineSi" ILIKE ${like}`,
    Prisma.sql`"bioSi" ILIKE ${like}`,
    Prisma.sql`"city" ILIKE ${like}`,
    Prisma.sql`"contactName" ILIKE ${like}`,
    // Browse matches ANY single service title — unnest, never join, so a match
    // can't straddle a title boundary.
    Prisma.sql`EXISTS (SELECT 1 FROM unnest("serviceTitles") AS t(title) WHERE t.title ILIKE ${like})`,
  ];
  if (categorySlugs.length > 0) {
    arms.push(Prisma.sql`"category" IN (${Prisma.join(categorySlugs)})`);
  }
  return Prisma.sql`(${Prisma.join(arms, " OR ")})`;
}

// The full WHERE clause. No `suspended` predicate on purpose: the index only
// ever contains publicly visible rows (suspended/erased providers are deleted
// from it), which is the leak-proofing the RFC requires.
export function buildWhere(f: SearchFilters, now: Date = new Date()): Prisma.Sql {
  const conds: Prisma.Sql[] = [];
  if (f.category) conds.push(Prisma.sql`"category" = ${f.category}`);
  if (f.district) {
    // Membership test on the served set (#502), GIN-backed.
    conds.push(Prisma.sql`"serviceDistricts" @> ARRAY[${f.district}]::text[]`);
  }
  if (f.availableOnly) {
    // Effective availability (#49): away-until-a-future-date is unavailable.
    conds.push(
      Prisma.sql`("available" = true AND ("awayUntil" IS NULL OR "awayUntil" <= ${now}))`
    );
  }
  if (f.priceMin != null || f.priceMax != null) {
    // A provider matches when ANY of its services is priced inside the range
    // (parity with browse's services.some).
    const priceConds: Prisma.Sql[] = [];
    if (f.priceMin != null) priceConds.push(Prisma.sql`sp.price >= ${f.priceMin}`);
    if (f.priceMax != null) priceConds.push(Prisma.sql`sp.price <= ${f.priceMax}`);
    conds.push(
      Prisma.sql`EXISTS (SELECT 1 FROM unnest("servicePrices") AS sp(price) WHERE ${Prisma.join(priceConds, " AND ")})`
    );
  }
  if (f.ratingMin != null) {
    // Browse applies this after rating hydration: no reviews (null rating)
    // never satisfies a minimum. DB-side at last — the RFC's point.
    conds.push(
      Prisma.sql`("ratingAvg" IS NOT NULL AND "ratingAvg" >= ${f.ratingMin})`
    );
  }
  const q = f.q?.trim();
  if (q) conds.push(freeTextSql(q, f.categorySlugs ?? []));
  if (f.point && f.radiusKm != null) {
    // Radius filter (§3.2): geography ST_DWithin takes meters, GiST-backed.
    // Unpinned providers (NULL location) never match a radius query.
    conds.push(
      Prisma.sql`("location" IS NOT NULL AND ST_DWithin("location", ${pointSql(f.point)}, ${f.radiusKm * 1000}))`
    );
  }
  if (conds.length === 0) return Prisma.empty;
  return Prisma.sql`WHERE ${Prisma.join(conds, " AND ")}`;
}

// ORDER BY per sort key — each reproduces provider-service's lib/sort.ts
// comparator chain, with a final providerId tiebreak for determinism (browse's
// in-memory sort leaves full ties in arbitrary DB return order, so ties carry
// no parity promise).
export function buildOrderBy(sort: SortKey, point?: GeoPoint | null): Prisma.Sql {
  const newest = Prisma.sql`"createdAt" DESC, "providerId" ASC`;
  switch (sort) {
    case "rating":
      return Prisma.sql`"ratingAvg" DESC NULLS LAST, "ratingCount" DESC, ${newest}`;
    case "reviews":
      return Prisma.sql`"ratingCount" DESC, coalesce("ratingAvg", 0) DESC, ${newest}`;
    case "price":
      return Prisma.sql`"minPrice" ASC NULLS LAST, coalesce("ratingAvg", 0) DESC, ${newest}`;
    case "experience":
      return Prisma.sql`"experience" DESC, coalesce("ratingAvg", 0) DESC, ${newest}`;
    case "newest":
      return newest;
    case "distance":
      // KNN nearest-first. The route only permits this sort with a point; the
      // guard keeps a drifted caller deterministic rather than crashing.
      if (!point) return newest;
      return Prisma.sql`"location" <-> ${pointSql(point)} ASC, ${newest}`;
    case "recommended":
    default:
      // Bayesian rating + recency + verified boost (lib/sort.ts's
      // recommendedScore): bayes = (ratingSum + prior) / (count + priorCount),
      // where ratingSum = avg * count (0 when unrated). The constants are
      // compile-time literals (never user input), inlined with Prisma.raw
      // rather than bound: a bound param inside `CASE … ELSE 0 END` gets
      // unified to the ELSE arm's integer type and 0.75 then fails to cast
      // (22P02) — literals carry their own types.
      return Prisma.sql`(
        (coalesce("ratingAvg", 0) * "ratingCount" + ${Prisma.raw(String(PRIOR_MEAN * PRIOR_COUNT))}) / ("ratingCount" + ${Prisma.raw(String(PRIOR_COUNT))})
        + ${Prisma.raw(String(RECENCY_WEIGHT))} * exp(-GREATEST(extract(epoch FROM (now() - "createdAt")), 0) / 86400.0 / ${Prisma.raw(String(RECENCY_HALFLIFE_DAYS))})
        + (CASE WHEN "verificationStatus" = 'VERIFIED' THEN ${Prisma.raw(String(VERIFIED_BOOST))} ELSE 0 END)
      ) DESC, ${newest}`;
  }
}
