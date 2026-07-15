// Pure normalization of the job listing query params (the `/board` and `/mine`
// endpoints) so it can be unit-tested without a request. Mirrors
// provider-service's lib/query.ts: page >= 1, pageSize defaults to 20 and is
// capped at 50 (`take` is an alias for pageSize). Keeping this a pure function
// makes the bounds a single, testable source of truth.
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 50;

// Deep-pagination guard (#657/#753): `page` feeds the SQL OFFSET
// (`(page - 1) * pageSize`), so an unbounded page number lets a caller force
// Postgres to scan-and-discard an arbitrarily large prefix — and a huge value
// (e.g. `?page=1e300`) overflows the 64-bit skip Prisma rejects with a 500.
// Cap it in lockstep with search-service's MAX_PAGE.
export const MAX_PAGE = 500;

// Cap on the number of ids fanned out to a single S2S hydration batch, so the
// `?ids=` query string / IN (...) clause can't grow without bound even if a
// page somehow carries more distinct ids. Mirrors provider-service's
// MAX_BATCH_IDS (the peer internal endpoints slice to the same bound).
export const MAX_BATCH_IDS = 500;

export type ListQuery = {
  page: number;
  pageSize: number;
};

// Anything non-numeric or below 1 falls back to the given default.
function toPositiveInt(raw: string | null | undefined, fallback: number): number {
  const n = Math.floor(Number(raw));
  return Number.isFinite(n) && n >= 1 ? n : fallback;
}

// Normalize page/pageSize for the job listings: page >= 1, pageSize defaults to
// 20 and is capped at 50 (`take` accepted as an alias for pageSize).
export function normalizeListQuery(params: {
  page?: string | null;
  pageSize?: string | null;
  take?: string | null;
}): ListQuery {
  const page = Math.min(MAX_PAGE, toPositiveInt(params.page, 1));
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    toPositiveInt(params.pageSize ?? params.take, DEFAULT_PAGE_SIZE)
  );
  return { page, pageSize };
}

// Bound an id list before it is fanned out to an S2S hydration endpoint.
export function capBatchIds(ids: string[]): string[] {
  return ids.slice(0, MAX_BATCH_IDS);
}
