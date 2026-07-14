// Pure normalization of the /api/search/providers query params. The non-geo
// half is a lockstep copy of provider-service's lib/query.ts + lib/sort.ts
// normalization (same defaults, caps and clamps) so the two endpoints accept
// identical inputs during the browse → search transition — keep edits in sync
// until provider-service's browse route is retired (RFC §5.2). The geo params
// (lat/lng/radiusKm, sort=distance) are the additive search-service superset.

export const DEFAULT_PAGE_SIZE = 12;
export const MAX_PAGE_SIZE = 24;
export const MIN_RATING = 1;
export const MAX_RATING = 5;

// Deep-pagination guard (#657): `page` feeds the SQL OFFSET
// (`(page - 1) * pageSize`), so an unbounded page number lets a caller force
// Postgres to scan-and-discard an arbitrarily large prefix — a cheap-request /
// expensive-server DoS. Cap it well beyond any real paging depth: 500 pages ×
// 24 per page = 12,000 results, far deeper than the index (or any human) ever
// walks. A crawler wanting more must narrow filters, not walk OFFSET. Kept in
// lockstep with provider-service's browse cap (RFC §5.2).
export const MAX_PAGE = 500;

// Nearby defaults (RFC §5.1): capped radius, default 25 km, max 100 km.
export const DEFAULT_RADIUS_KM = 25;
export const MAX_RADIUS_KM = 100;

// Browse's sort keys plus the geo-only `distance` (honored only when the
// request carries a valid lat/lng point — silently falls back otherwise, the
// same forgiving normalization browse applies to unknown keys).
export const SORT_KEYS = [
  "recommended",
  "rating",
  "reviews",
  "price",
  "experience",
  "newest",
  "distance",
] as const;

export type SortKey = (typeof SORT_KEYS)[number];

export const DEFAULT_SORT: SortKey = "recommended";

export function normalizeSort(value: unknown): SortKey {
  return SORT_KEYS.includes(value as SortKey) ? (value as SortKey) : DEFAULT_SORT;
}

export type GeoPoint = { lat: number; lng: number };

export type SearchQuery = {
  page: number;
  pageSize: number;
  sort: SortKey;
  priceMin: number | null;
  priceMax: number | null;
  ratingMin: number | null;
  availableOnly: boolean;
  // Both present and in-bounds, or null — half a pair is dropped, mirroring
  // provider-service's both-or-neither pin rule (#48).
  point: GeoPoint | null;
  // Radius filter in km; only meaningful with a point. null = no radius cap.
  radiusKm: number | null;
};

// Anything non-numeric or below 1 falls back to the given default.
function toPositiveInt(raw: string | null | undefined, fallback: number): number {
  const n = Math.floor(Number(raw));
  return Number.isFinite(n) && n >= 1 ? n : fallback;
}

// Optional integer rupee amount: absent/junk/negative → null (no filter).
function toRupees(raw: string | null | undefined): number | null {
  if (raw == null || raw.trim() === "") return null;
  const n = Math.floor(Number(raw));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

// Optional minimum rating clamped into [1, 5]; absent/junk → null (no filter).
function toRatingMin(raw: string | null | undefined): number | null {
  if (raw == null || raw.trim() === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.min(MAX_RATING, Math.max(MIN_RATING, n));
}

function toCoord(raw: string | null | undefined, bound: number): number | null {
  if (raw == null || raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) && Math.abs(n) <= bound ? n : null;
}

// lat + lng must both parse and sit in world bounds, else no point at all.
export function parsePoint(
  latRaw: string | null | undefined,
  lngRaw: string | null | undefined
): GeoPoint | null {
  const lat = toCoord(latRaw, 90);
  const lng = toCoord(lngRaw, 180);
  return lat !== null && lng !== null ? { lat, lng } : null;
}

// Radius in km: absent/junk → null (no cap); values clamp into (0, 100].
export function parseRadiusKm(raw: string | null | undefined): number | null {
  if (raw == null || raw.trim() === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(MAX_RADIUS_KM, n);
}

export function normalizeSearchQuery(params: {
  page?: string | null;
  pageSize?: string | null;
  take?: string | null;
  sort?: string | null;
  priceMin?: string | null;
  priceMax?: string | null;
  ratingMin?: string | null;
  availableOnly?: string | null;
  lat?: string | null;
  lng?: string | null;
  radiusKm?: string | null;
}): SearchQuery {
  const page = Math.min(MAX_PAGE, toPositiveInt(params.page, 1));
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    toPositiveInt(params.pageSize ?? params.take, DEFAULT_PAGE_SIZE)
  );
  let priceMin = toRupees(params.priceMin);
  let priceMax = toRupees(params.priceMax);
  if (priceMin !== null && priceMax !== null && priceMin > priceMax) {
    [priceMin, priceMax] = [priceMax, priceMin];
  }
  const point = parsePoint(params.lat, params.lng);
  let sort = normalizeSort(params.sort);
  if (sort === "distance" && point === null) sort = DEFAULT_SORT;
  return {
    page,
    pageSize,
    sort,
    priceMin,
    priceMax,
    ratingMin: toRatingMin(params.ratingMin),
    availableOnly:
      params.availableOnly === "1" || params.availableOnly === "true",
    point,
    radiusKm: point ? parseRadiusKm(params.radiusKm) : null,
  };
}
