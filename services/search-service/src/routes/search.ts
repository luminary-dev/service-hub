// Public query plane (via the gateway): the browse-superset search and the
// radius/nearest "nearby" endpoint (RFC §5.1). Both return ranked ids from the
// index, hydrate card DTOs from provider-service (display data stays
// single-sourced) and overlay this index's rating aggregates + distance.
import { Hono } from "hono";
import { Prisma } from "@prisma/client";
import type { Context } from "hono";
import { db } from "../db";
import { fetchCards, matchCategorySlugs } from "../lib/clients";
import {
  DEFAULT_RADIUS_KM,
  normalizeSearchQuery,
  parsePoint,
  parseRadiusKm,
  type SortKey,
} from "../lib/query";
import { buildOrderBy, buildWhere, pointSql, type SearchFilters } from "../lib/sql";

export const searchRoutes = new Hono();

type RankedRow = {
  providerId: string;
  ratingAvg: number | null;
  ratingCount: number;
  distanceM: number | null;
};

// Rank in the index, hydrate cards, overlay ratings (+ distanceKm when the
// request carried a point). Same envelope + card DTO as browse so the web swap
// (phase 3) is mechanical.
async function respondWithResults(
  c: Context,
  filters: SearchFilters,
  sort: SortKey,
  page: number,
  pageSize: number
) {
  const where = buildWhere(filters);
  const distance = filters.point
    ? Prisma.sql`ST_Distance("location", ${pointSql(filters.point)})`
    : Prisma.sql`NULL::double precision`;
  const [rows, totalRows] = await Promise.all([
    db.$queryRaw<RankedRow[]>(Prisma.sql`
      SELECT "providerId", "ratingAvg", "ratingCount", ${distance} AS "distanceM"
      FROM "ProviderIndex"
      ${where}
      ORDER BY ${buildOrderBy(sort, filters.point)}
      LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
    `),
    db.$queryRaw<{ count: number }[]>(
      Prisma.sql`SELECT COUNT(*)::int AS count FROM "ProviderIndex" ${where}`
    ),
  ]);
  const total = totalRows[0]?.count ?? 0;

  const cards = await fetchCards(rows.map((r) => r.providerId));
  if (cards === null) {
    // Ranked ids without display data are useless — fail loudly; during the
    // transition the web still has /api/providers to fall back to (RFC §5.2).
    return c.json({ error: "Search is temporarily unavailable" }, 503);
  }
  const byId = new Map(cards.map((card) => [card.id, card]));
  const providers = rows.flatMap((r) => {
    const card = byId.get(r.providerId);
    // An index row whose source vanished between rank and hydration (erase
    // racing the sweep) is dropped rather than served half-empty.
    if (!card) return [];
    return [
      {
        ...card,
        // Rating fields come from THIS index (already ranking on them);
        // ratingAvg is null while the count is 0, matching browse.
        rating: r.ratingCount > 0 ? r.ratingAvg : null,
        reviewCount: r.ratingCount,
        // 1-decimal km, only when the request was geographic (RFC §3.2).
        ...(r.distanceM != null
          ? { distanceKm: Math.round(r.distanceM / 100) / 10 }
          : {}),
      },
    ];
  });

  return c.json({ providers, total, page, pageSize });
}

// Superset of provider-service's browse: same params/envelope/card DTO plus
// lat/lng/radiusKm and sort=distance. Browse itself stays on provider-service
// until the web migrates (RFC §5.2) — this endpoint must match its results for
// the shared params (see the parity check in scripts/e2e-smoke.sh).
searchRoutes.get("/api/search/providers", async (c) => {
  const query = c.req.query();
  const nq = normalizeSearchQuery({
    page: query.page ?? null,
    pageSize: query.pageSize ?? null,
    take: query.take ?? null,
    sort: query.sort ?? null,
    priceMin: query.priceMin ?? null,
    priceMax: query.priceMax ?? null,
    ratingMin: query.ratingMin ?? null,
    availableOnly: query.availableOnly ?? null,
    lat: query.lat ?? null,
    lng: query.lng ?? null,
    radiusKm: query.radiusKm ?? null,
  });
  const q = query.q?.trim() || null;
  const filters: SearchFilters = {
    q,
    // #128: free text also matches categories by EN/SI label (resolved against
    // provider-service's category list; degrades to no label-arm on outage).
    categorySlugs: q ? await matchCategorySlugs(q) : [],
    category: query.category || null,
    district: query.district || null,
    priceMin: nq.priceMin,
    priceMax: nq.priceMax,
    ratingMin: nq.ratingMin,
    availableOnly: nq.availableOnly,
    point: nq.point,
    radiusKm: nq.radiusKm,
  };
  return respondWithResults(c, filters, nq.sort, nq.page, nq.pageSize);
});

// Radius + nearest-first (RFC §5.1): pinned providers only, radius default
// 25 km capped at 100. Accepts the same relational filters as the main search.
searchRoutes.get("/api/search/providers/nearby", async (c) => {
  const query = c.req.query();
  const point = parsePoint(query.lat ?? null, query.lng ?? null);
  if (!point) {
    return c.json({ error: "lat and lng are required" }, 400);
  }
  const nq = normalizeSearchQuery({
    page: query.page ?? null,
    pageSize: query.pageSize ?? null,
    take: query.take ?? null,
    priceMin: query.priceMin ?? null,
    priceMax: query.priceMax ?? null,
    ratingMin: query.ratingMin ?? null,
    availableOnly: query.availableOnly ?? null,
  });
  const q = query.q?.trim() || null;
  const filters: SearchFilters = {
    q,
    categorySlugs: q ? await matchCategorySlugs(q) : [],
    category: query.category || null,
    district: query.district || null,
    priceMin: nq.priceMin,
    priceMax: nq.priceMax,
    ratingMin: nq.ratingMin,
    availableOnly: nq.availableOnly,
    point,
    radiusKm: parseRadiusKm(query.radiusKm ?? null) ?? DEFAULT_RADIUS_KM,
  };
  return respondWithResults(c, filters, "distance", nq.page, nq.pageSize);
});
