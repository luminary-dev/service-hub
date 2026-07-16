// Provider rating write-back (#748): after any write that changes a provider's
// rating aggregates (review create/edit, moderation soft-delete/restore),
// recompute the overall average + count from the Review table and PUT them to
// provider-service so it can denormalize ratingAvg/ratingCount onto Provider —
// letting the hot public /api/providers browse filter/sort/count DB-side
// instead of fanning out a live per-request rating aggregation.
//
// Same fire-and-forget, best-effort contract as the search-index push
// (`void pushRatingToProvider(...)` at the call sites): the review write has
// already committed, so a failure here is logged and swallowed — it must never
// fail the triggering write. A dropped push is self-healing: the next write for
// the same provider recomputes from scratch, and provider-service can backfill
// from /internal/ratings in bulk.
import { db } from "../db";
import { s2s } from "./http";
import { log } from "./log";

const PROVIDER_SERVICE_URL =
  process.env.PROVIDER_SERVICE_URL ?? "http://localhost:4002";

export async function pushRatingToProvider(providerId: string): Promise<void> {
  if (!providerId) return;
  try {
    // Same aggregation as /internal/ratings and the search-index push:
    // non-deleted reviews only, so a moderation soft-delete immediately drops
    // out of the pushed average.
    const [agg] = await db.review.groupBy({
      by: ["providerId"],
      where: { providerId, deletedAt: null },
      _avg: { rating: true },
      _count: { _all: true },
    });
    const res = await s2s(
      PROVIDER_SERVICE_URL,
      `/internal/providers/${encodeURIComponent(providerId)}/rating`,
      {
        method: "PUT",
        body: JSON.stringify({
          // Absent from the groupBy = no non-deleted reviews left → null/0.
          ratingAvg: agg?._avg.rating ?? null,
          ratingCount: agg?._count._all ?? 0,
        }),
      }
    );
    if (!res.ok) {
      throw new Error(`provider rating write-back failed: ${res.status}`);
    }
  } catch (e) {
    log.error("provider rating write-back failed", {
      context: "provider-rating",
      providerId,
      err: e,
    });
  }
}
