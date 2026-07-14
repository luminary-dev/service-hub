// Thin S2S clients for the peers this service reads from. All read-path
// hydration degrades gracefully (per the shared conventions) — a failing peer
// must never take down a provider page.
import { s2s } from "./http";

const IDENTITY_URL = process.env.IDENTITY_SERVICE_URL ?? "http://localhost:4001";
const REVIEW_URL = process.env.REVIEW_SERVICE_URL ?? "http://localhost:4003";
const JOB_URL = process.env.JOB_SERVICE_URL ?? "http://localhost:4004";

export type RatingEntry = { rating: number; count: number };

// Discriminated ratings result. `ok` is false when at least one batch failed
// to load (review-service outage / non-2xx / network error), so callers that
// must tell "peer is down" apart from "provider genuinely has no reviews" can
// refuse to act on the absent ratings. `ok: true` means every batch answered,
// so a missing provider id truly has no reviews. (#366)
export type RatingsResult = { ok: boolean; ratings: Record<string, RatingEntry> };

// Cap the ids per request so a large provider set can't build an unbounded
// query string / `IN (...)` on review-service. Batches are merged; a failing
// batch degrades to "no reviews" for its providers without failing the rest.
const RATINGS_CHUNK = 200;

// review-service GET /internal/ratings?providerIds=a,b → { ratings: {...} }.
// Read-path clients render "no reviews" on failure; the returned `ok` flag lets
// the auto-flagging sweep (which would otherwise mistake an outage for genuine
// zero-review providers and falsely flag them) opt out of the quality signal.
export async function fetchRatingsResult(
  providerIds: string[]
): Promise<RatingsResult> {
  if (providerIds.length === 0) return { ok: true, ratings: {} };
  const out: Record<string, RatingEntry> = {};
  let ok = true;
  for (let i = 0; i < providerIds.length; i += RATINGS_CHUNK) {
    const chunk = providerIds.slice(i, i + RATINGS_CHUNK);
    try {
      const res = await s2s(
        REVIEW_URL,
        `/internal/ratings?providerIds=${encodeURIComponent(chunk.join(","))}`
      );
      if (!res.ok) {
        ok = false;
        continue;
      }
      const data = (await res.json()) as {
        ratings?: Record<string, RatingEntry>;
      };
      Object.assign(out, data.ratings ?? {});
    } catch {
      // degrade for this chunk only, but remember the batch was incomplete
      ok = false;
    }
  }
  return { ok, ratings: out };
}

// Convenience wrapper for read paths that degrade to "no reviews" and don't
// care whether the fetch was complete — returns just the ratings map ({} on a
// total outage), preserving the original graceful-degradation contract.
export async function fetchRatings(
  providerIds: string[]
): Promise<Record<string, RatingEntry>> {
  return (await fetchRatingsResult(providerIds)).ratings;
}

export type HydratedReview = {
  id: string;
  rating: number;
  comment: string;
  createdAt: string;
  user: { name: string };
  photos: { id: string; url: string }[];
};

// review-service GET /internal/by-provider/:id → reviews (cursor-paginated)
// with reviewer names and photos. Degrades to an empty page.
export async function fetchProviderReviews(
  providerId: string,
  opts: { take?: number; cursor?: string; includeDeleted?: boolean } = {}
): Promise<{ reviews: HydratedReview[]; nextCursor: string | null }> {
  try {
    const qs = new URLSearchParams();
    if (opts.take) qs.set("take", String(opts.take));
    if (opts.cursor) qs.set("cursor", opts.cursor);
    if (opts.includeDeleted) qs.set("includeDeleted", "1");
    const suffix = qs.size > 0 ? `?${qs.toString()}` : "";
    const res = await s2s(REVIEW_URL, `/internal/by-provider/${providerId}${suffix}`);
    if (!res.ok) return { reviews: [], nextCursor: null };
    const data = (await res.json()) as {
      reviews?: HydratedReview[];
      nextCursor?: string | null;
    };
    return { reviews: data.reviews ?? [], nextCursor: data.nextCursor ?? null };
  } catch {
    return { reviews: [], nextCursor: null };
  }
}

// review-service GET /internal/count → { count }. Degrades to 0.
export async function fetchReviewCount(): Promise<number> {
  try {
    const res = await s2s(REVIEW_URL, "/internal/count");
    if (!res.ok) return 0;
    const data = (await res.json()) as { count?: number };
    return data.count ?? 0;
  } catch {
    return 0;
  }
}

// identity-service GET /internal/users?ids= → emailVerified for the dashboard
// banner. Degrades to null (banner shows; harmless).
export async function fetchEmailVerified(userId: string): Promise<string | null> {
  try {
    const res = await s2s(IDENTITY_URL, `/internal/users?ids=${encodeURIComponent(userId)}`);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      users?: { id: string; emailVerified: string | null }[];
    };
    return data.users?.find((u) => u.id === userId)?.emailVerified ?? null;
  } catch {
    return null;
  }
}

// identity-service PATCH /internal/users/:id — keeps the user row in sync
// after a profile update. Best-effort: the provider row is the write we own.
export async function syncIdentityProfile(
  userId: string,
  body: { name: string; phone: string }
): Promise<void> {
  try {
    await s2s(IDENTITY_URL, `/internal/users/${userId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  } catch {
    // best-effort
  }
}

// job-service GET /internal/jobs/count — matching open jobs for the dashboard
// badge. Degrades to 0. `districts` is the provider's served set (#502).
export async function fetchOpenJobsCount(
  category: string,
  districts: string[],
  excludeCustomerId: string
): Promise<number> {
  try {
    const qs = new URLSearchParams({
      category,
      districts: districts.join(","),
      excludeCustomerId,
    });
    const res = await s2s(JOB_URL, `/internal/jobs/count?${qs.toString()}`);
    if (!res.ok) return 0;
    const data = (await res.json()) as { count?: number };
    return data.count ?? 0;
  } catch {
    return 0;
  }
}
