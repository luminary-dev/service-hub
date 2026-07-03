// Sort options for the provider directory. Sorting itself happens in
// provider-service (the `sort` query param passes through); the web app only
// needs the list of keys for the FilterBar UI and URL normalization.
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
