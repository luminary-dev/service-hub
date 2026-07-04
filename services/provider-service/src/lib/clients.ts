// Thin S2S clients for the peers this service reads from. All read-path
// hydration degrades gracefully (per the shared conventions) — a failing peer
// must never take down a provider page.
import { s2s } from "./http";

const IDENTITY_URL = process.env.IDENTITY_SERVICE_URL ?? "http://localhost:4001";
const REVIEW_URL = process.env.REVIEW_SERVICE_URL ?? "http://localhost:4003";
const JOB_URL = process.env.JOB_SERVICE_URL ?? "http://localhost:4004";
const NOTIFICATION_URL =
  process.env.NOTIFICATION_SERVICE_URL ?? "http://localhost:4005";

export type RatingEntry = { rating: number; count: number };

// review-service GET /internal/ratings?providerIds=a,b → { ratings: {...} }.
// Degrades to {} (callers render "no reviews").
export async function fetchRatings(
  providerIds: string[]
): Promise<Record<string, RatingEntry>> {
  if (providerIds.length === 0) return {};
  try {
    const res = await s2s(
      REVIEW_URL,
      `/internal/ratings?providerIds=${encodeURIComponent(providerIds.join(","))}`
    );
    if (!res.ok) return {};
    const data = (await res.json()) as { ratings?: Record<string, RatingEntry> };
    return data.ratings ?? {};
  } catch {
    return {};
  }
}

export type HydratedReview = {
  id: string;
  rating: number;
  comment: string;
  createdAt: string;
  user: { name: string };
  photos: { id: string; url: string }[];
};

// review-service GET /internal/by-provider/:id → reviews with reviewer names
// and photos. Degrades to [].
export async function fetchProviderReviews(providerId: string): Promise<HydratedReview[]> {
  try {
    const res = await s2s(REVIEW_URL, `/internal/by-provider/${providerId}`);
    if (!res.ok) return [];
    const data = (await res.json()) as { reviews?: HydratedReview[] };
    return data.reviews ?? [];
  } catch {
    return [];
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

// notification-service POST /internal/email/inquiry — tells the provider they
// received an inquiry. Best-effort: a mail failure must never fail the
// inquiry itself (mirrors job-service's job-response email).
export async function sendInquiryEmail(args: {
  to: string;
  url: string;
  customerName: string;
  locale: "en" | "si";
}): Promise<void> {
  try {
    await s2s(NOTIFICATION_URL, "/internal/email/inquiry", {
      method: "POST",
      body: JSON.stringify(args),
    });
  } catch (e) {
    console.error("[inquiry] notification failed", e);
  }
}

// job-service GET /internal/jobs/count — matching open jobs for the dashboard
// badge. Degrades to 0.
export async function fetchOpenJobsCount(
  category: string,
  district: string,
  excludeCustomerId: string
): Promise<number> {
  try {
    const qs = new URLSearchParams({ category, district, excludeCustomerId });
    const res = await s2s(JOB_URL, `/internal/jobs/count?${qs.toString()}`);
    if (!res.ok) return 0;
    const data = (await res.json()) as { count?: number };
    return data.count ?? 0;
  } catch {
    return 0;
  }
}
