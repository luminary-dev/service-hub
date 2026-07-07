// Shared constants for the admin providers list (#224). Sorting/filtering
// itself happens in provider-service; the web app only needs these keys for
// the filter bar UI and URL normalization (mirrors lib/sort-keys.ts for the
// public directory).
export const ADMIN_SORT_KEYS = ["newest", "mostReviews"] as const;
export type AdminSortKey = (typeof ADMIN_SORT_KEYS)[number];
export const ADMIN_DEFAULT_SORT: AdminSortKey = "newest";

export function normalizeAdminSort(value: unknown): AdminSortKey {
  return ADMIN_SORT_KEYS.includes(value as AdminSortKey)
    ? (value as AdminSortKey)
    : ADMIN_DEFAULT_SORT;
}

export const VERIFICATION_STATUSES = [
  "VERIFIED",
  "PENDING",
  "REJECTED",
  "NONE",
] as const;
export type VerificationStatusFilter = (typeof VERIFICATION_STATUSES)[number];

export function normalizeStatusFilter(value: unknown): VerificationStatusFilter | "" {
  return VERIFICATION_STATUSES.includes(value as VerificationStatusFilter)
    ? (value as VerificationStatusFilter)
    : "";
}

export function normalizeSuspendedFilter(value: unknown): "true" | "false" | "" {
  return value === "true" || value === "false" ? value : "";
}
