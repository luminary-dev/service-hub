import { normalizeSort, type SortKey } from "./sort";

export const DEFAULT_PAGE_SIZE = 12;
export const MAX_PAGE_SIZE = 24;

export type ListQuery = { page: number; pageSize: number; sort: SortKey };

// Anything non-numeric or below 1 falls back to the given default.
function toPositiveInt(raw: string | null | undefined, fallback: number): number {
  const n = Math.floor(Number(raw));
  return Number.isFinite(n) && n >= 1 ? n : fallback;
}

// Pure normalization of the /api/providers listing query params so it can be
// unit-tested without a request: page >= 1, pageSize defaults to 12 and is
// capped at 24 (`take` is an alias for pageSize used by the home page), sort
// falls back to "recommended".
export function normalizeListQuery(params: {
  page?: string | null;
  pageSize?: string | null;
  take?: string | null;
  sort?: string | null;
}): ListQuery {
  const page = toPositiveInt(params.page, 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    toPositiveInt(params.pageSize ?? params.take, DEFAULT_PAGE_SIZE)
  );
  return { page, pageSize, sort: normalizeSort(params.sort) };
}
