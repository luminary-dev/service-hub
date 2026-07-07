// Pure query-normalization and where-clause building for the admin providers
// listing (#224: search, filter, sort, pagination). Split out from the route
// handler (mirroring lib/query.ts + lib/search.ts for the public directory)
// so it's unit-testable without a database.
import type { Prisma } from "@prisma/client";

export const ADMIN_SORT_KEYS = ["newest", "mostReviews"] as const;
export type AdminSortKey = (typeof ADMIN_SORT_KEYS)[number];
export const ADMIN_DEFAULT_SORT: AdminSortKey = "newest";

export const ADMIN_DEFAULT_PAGE_SIZE = 20;
export const ADMIN_MAX_PAGE_SIZE = 100;

// Provider.verificationStatus is a plain string column (no DB enum), but
// these are the only values the app ever writes.
export const VERIFICATION_STATUSES = [
  "NONE",
  "PENDING",
  "VERIFIED",
  "REJECTED",
] as const;
export type VerificationStatusFilter = (typeof VERIFICATION_STATUSES)[number];

export type AdminListQuery = {
  page: number;
  pageSize: number;
  sort: AdminSortKey;
  q: string;
  category: string | null;
  city: string | null;
  status: VerificationStatusFilter | null;
  // null = both suspended and active providers (no filter).
  suspended: boolean | null;
};

// Anything non-numeric or below 1 falls back to the given default.
function toPositiveInt(raw: string | null | undefined, fallback: number): number {
  const n = Math.floor(Number(raw));
  return Number.isFinite(n) && n >= 1 ? n : fallback;
}

// Normalizes the raw query params for GET /api/admin/providers: page >= 1,
// pageSize defaults to 20 and is capped at 100 (this is an internal
// moderation tool, not a public-facing directory), sort falls back to
// "newest", status must be a known verificationStatus value or is dropped,
// suspended is only set by the literal strings "true"/"false".
export function normalizeAdminListQuery(params: {
  q?: string | null;
  category?: string | null;
  city?: string | null;
  status?: string | null;
  suspended?: string | null;
  sort?: string | null;
  page?: string | null;
  pageSize?: string | null;
}): AdminListQuery {
  const page = toPositiveInt(params.page, 1);
  const pageSize = Math.min(
    ADMIN_MAX_PAGE_SIZE,
    toPositiveInt(params.pageSize, ADMIN_DEFAULT_PAGE_SIZE)
  );
  const sort = ADMIN_SORT_KEYS.includes(params.sort as AdminSortKey)
    ? (params.sort as AdminSortKey)
    : ADMIN_DEFAULT_SORT;
  const status = VERIFICATION_STATUSES.includes(
    params.status as VerificationStatusFilter
  )
    ? (params.status as VerificationStatusFilter)
    : null;
  const suspended =
    params.suspended === "true"
      ? true
      : params.suspended === "false"
        ? false
        : null;

  return {
    page,
    pageSize,
    sort,
    q: params.q?.trim() ?? "",
    category: params.category?.trim() || null,
    city: params.city?.trim() || null,
    status,
    suspended,
  };
}

export type AdminProviderFilters = {
  q?: string | null;
  category?: string | null;
  city?: string | null;
  status?: VerificationStatusFilter | null;
  suspended?: boolean | null;
};

// The moderation queue intentionally shows suspended providers too (unlike
// the public directory), so `suspended` is a filter here, not a fixed
// exclusion. City has no fixed enumeration (free-text town/city names), so
// it matches like the search box does: case-insensitive `contains`.
export function buildAdminProvidersWhere(
  f: AdminProviderFilters
): Prisma.ProviderWhereInput {
  const q = f.q?.trim();
  return {
    ...(f.category ? { category: f.category } : {}),
    ...(f.city ? { city: { contains: f.city.trim(), mode: "insensitive" } } : {}),
    ...(f.status ? { verificationStatus: f.status } : {}),
    ...(f.suspended !== null && f.suspended !== undefined
      ? { suspended: f.suspended }
      : {}),
    ...(q
      ? {
          OR: [
            { contactName: { contains: q, mode: "insensitive" } },
            { contactEmail: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
}
