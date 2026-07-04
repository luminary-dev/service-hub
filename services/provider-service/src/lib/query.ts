import { normalizeSort, type SortKey } from "./sort";

export const DEFAULT_PAGE_SIZE = 12;
export const MAX_PAGE_SIZE = 24;
export const MIN_RATING = 1;
export const MAX_RATING = 5;

export type ListQuery = {
  page: number;
  pageSize: number;
  sort: SortKey;
  // Advanced filters (#47): null/false means "not filtering on this".
  priceMin: number | null;
  priceMax: number | null;
  ratingMin: number | null;
  availableOnly: boolean;
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

// Pure normalization of the /api/providers listing query params so it can be
// unit-tested without a request: page >= 1, pageSize defaults to 12 and is
// capped at 24 (`take` is an alias for pageSize used by the home page), sort
// falls back to "recommended". Advanced filters (#47): priceMin/priceMax are
// optional non-negative integer rupees (swapped when min > max), ratingMin is
// clamped into 1..5, availableOnly is set only by "1"/"true".
export function normalizeListQuery(params: {
  page?: string | null;
  pageSize?: string | null;
  take?: string | null;
  sort?: string | null;
  priceMin?: string | null;
  priceMax?: string | null;
  ratingMin?: string | null;
  availableOnly?: string | null;
}): ListQuery {
  const page = toPositiveInt(params.page, 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    toPositiveInt(params.pageSize ?? params.take, DEFAULT_PAGE_SIZE)
  );
  let priceMin = toRupees(params.priceMin);
  let priceMax = toRupees(params.priceMax);
  if (priceMin !== null && priceMax !== null && priceMin > priceMax) {
    [priceMin, priceMax] = [priceMax, priceMin];
  }
  return {
    page,
    pageSize,
    sort: normalizeSort(params.sort),
    priceMin,
    priceMax,
    ratingMin: toRatingMin(params.ratingMin),
    availableOnly:
      params.availableOnly === "1" || params.availableOnly === "true",
  };
}
