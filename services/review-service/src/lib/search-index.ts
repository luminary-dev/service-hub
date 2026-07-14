// Search-index rating push (search & discovery RFC §4.2): after any write
// that changes a provider's rating aggregates (review create/edit, moderation
// delete/restore, account erasure), recompute the overall average + count and
// POST them to search-service so rating filter/sort run DB-side there. Same
// fire-and-forget, best-effort contract as provider-service's document push
// (`void pushRatingsToSearchIndex(...)` at the call sites): the review write
// already committed, failures are logged and swallowed, and a dropped push is
// bounded by search-service's daily reindex sweep (which re-reads
// /internal/ratings in bulk).
import { db } from "../db";
import { s2s } from "./http";
import { log } from "./log";

const SEARCH_URL = process.env.SEARCH_SERVICE_URL ?? "http://localhost:4008";

export async function pushRatingsToSearchIndex(
  providerIds: string[]
): Promise<void> {
  const ids = [...new Set(providerIds.filter(Boolean))];
  if (ids.length === 0) return;
  try {
    // Same aggregation as /internal/ratings: non-deleted reviews only, so a
    // moderation soft-delete immediately drops out of the pushed average.
    const rows = await db.review.groupBy({
      by: ["providerId"],
      where: { providerId: { in: ids }, deletedAt: null },
      _avg: { rating: true },
      _count: { _all: true },
    });
    const byId = new Map(rows.map((r) => [r.providerId, r]));
    for (const providerId of ids) {
      const row = byId.get(providerId);
      const res = await s2s(SEARCH_URL, "/internal/search/ratings", {
        method: "POST",
        body: JSON.stringify({
          providerId,
          // Absent from the groupBy = no non-deleted reviews left → null/0
          // (search-service also normalizes a 0-count average to null).
          ratingAvg: row?._avg.rating ?? null,
          ratingCount: row?._count._all ?? 0,
        }),
      });
      if (!res.ok) {
        throw new Error(`search rating push failed: ${res.status}`);
      }
    }
  } catch (e) {
    log.error("search rating push failed", {
      context: "search-index",
      providerIds: ids,
      err: e,
    });
  }
}
