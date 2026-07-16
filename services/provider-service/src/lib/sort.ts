export const SORT_KEYS = [
  "recommended",
  "rating",
  "reviews",
  "price",
  "experience",
  "newest",
] as const;

export type SortKey = (typeof SORT_KEYS)[number];

export const DEFAULT_SORT: SortKey = "recommended";

export function normalizeSort(value: unknown): SortKey {
  return SORT_KEYS.includes(value as SortKey)
    ? (value as SortKey)
    : DEFAULT_SORT;
}

// Ranking constants for the "recommended" sort. Ranking now runs DB-side over
// the denormalized ratingAvg/ratingCount columns (#748, see lib/browse-query.ts),
// so these are the single source of truth for the Bayesian score both in SQL and
// in any future in-memory consumer.
//
// Bayesian rating pulls low-volume profiles toward a sensible prior so a single
// 5-star review doesn't outrank a long track record; a small recency boost fades
// in fresh profiles without letting recency dominate quality; verified profiles
// get a fixed nudge.
export const PRIOR_COUNT = 3;
export const PRIOR_MEAN = 4.0;
export const RECENCY_WEIGHT = 0.6;
export const RECENCY_HALFLIFE_DAYS = 45;
export const VERIFIED_BOOST = 0.75;
