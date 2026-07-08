// Pure page/pageSize normalization + open/closed slicing for the admin
// review-reports queue (#255). Mirrors provider-service's lib/admin-list.ts
// helpers of the same name — the two report queues are merged and paginated
// together on the admin frontend, so they must bound their pages identically.
// Kept database-free so it's unit-testable.

export const ADMIN_DEFAULT_PAGE_SIZE = 20;
export const ADMIN_MAX_PAGE_SIZE = 100;

// Anything non-numeric or below 1 falls back to the given default.
function toPositiveInt(raw: string | null | undefined, fallback: number): number {
  const n = Math.floor(Number(raw));
  return Number.isFinite(n) && n >= 1 ? n : fallback;
}

export type Pagination = { page: number; pageSize: number };

// page clamped to >= 1, pageSize defaults to 20 and is capped at 100 (an
// internal moderation tool, not a public directory, so no unbounded page).
export function normalizePagination(params: {
  page?: string | null;
  pageSize?: string | null;
}): Pagination {
  const page = toPositiveInt(params.page, 1);
  const pageSize = Math.min(
    ADMIN_MAX_PAGE_SIZE,
    toPositiveInt(params.pageSize, ADMIN_DEFAULT_PAGE_SIZE)
  );
  return { page, pageSize };
}

// The queue is a single "OPEN rows first, then closed rows" list, but the two
// groups are separate queries. Given the page window (skip/take) and how many
// OPEN rows exist in total, returns the skip/take for each sub-query so a page
// can be sliced out of the virtual concatenation without loading either group
// in full.
export function sliceOpenClosed(
  skip: number,
  take: number,
  openTotal: number
): { openSkip: number; openTake: number; closedSkip: number; closedTake: number } {
  const openTake = Math.max(0, Math.min(take, openTotal - skip));
  return {
    openSkip: openTake > 0 ? skip : 0,
    openTake,
    closedSkip: Math.max(0, skip - openTotal),
    closedTake: take - openTake,
  };
}
