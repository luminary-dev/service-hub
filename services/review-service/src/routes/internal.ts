import { Hono } from "hono";
import { db } from "../db";
import { listProviderReviews, normalizeTake } from "../lib/provider-reviews";
import { fetchRatingSummaries } from "../lib/rating-summary";
import { pushRatingsToSearchIndex } from "../lib/search-index";
import { removeStoredFile, sweepMedia } from "../lib/storage";

export const internal = new Hono();

// Batch rating summaries for provider cards / listings / admin lists.
// GET /internal/ratings?providerIds=a,b,c
// Each entry carries the overall `rating`+`count` (authoritative for ranking)
// plus the additive per-dimension averages and 5→1 star `distribution` (#528).
// Existing consumers keep reading `rating`/`count`; the extra fields are ignored
// unless a caller opts in.
internal.get("/ratings", async (c) => {
  const ids = (c.req.query("providerIds") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return c.json({ ratings: await fetchRatingSummaries(ids) });
});

// Reviews for one provider (createdAt desc, cursor-paginated), photos
// createdAt asc, reviewer names batch-hydrated from identity-service
// (degrades to "Unknown"). `nextCursor` is additive — existing consumers
// keep reading `reviews`.
internal.get("/by-provider/:id", async (c) => {
  const { reviews, nextCursor } = await listProviderReviews(c.req.param("id"), {
    take: normalizeTake(c.req.query("take")),
    cursor: c.req.query("cursor") || undefined,
    // Admin moderation views need to see (and restore) soft-deleted reviews.
    includeDeleted: c.req.query("includeDeleted") === "1",
  });
  return c.json({ reviews, nextCursor });
});

// Total review count (home page stats via provider-service).
internal.get("/count", async (c) => {
  const count = await db.review.count({ where: { deletedAt: null } });
  return c.json({ count });
});

// Periodic maintenance (#36): remove stored review-photo files no database
// row references any more. Grace window protects in-flight uploads; run it
// from ops tooling (cron/curl with the internal secret).
internal.post("/maintenance/sweep-orphans", async (c) => {
  const photos = await db.reviewPhoto.findMany({ select: { url: true } });
  const result = await sweepMedia("review", photos.map((p) => p.url));
  return c.json(result);
});

// POST /internal/users/:id/erase — account-deletion fan-out from
// identity-service. Deletes the user's reviews (photo rows cascade) and their
// stored photo files (best-effort — removeStoredFile swallows errors).
// Idempotent: erasing an unknown user is a no-op 200.
internal.post("/users/:id/erase", async (c) => {
  const userId = c.req.param("id");
  const [photos, reviews] = await Promise.all([
    db.reviewPhoto.findMany({
      where: { review: { userId } },
      select: { url: true },
    }),
    // Captured before the delete so the search-index rating push below knows
    // which providers' aggregates just changed.
    db.review.findMany({ where: { userId }, select: { providerId: true } }),
  ]);
  await db.review.deleteMany({ where: { userId } });
  for (const p of photos) {
    await removeStoredFile(p.url);
  }
  // Recount every affected provider (search RFC §4.2, fire-and-forget; the
  // helper dedupes ids).
  void pushRatingsToSearchIndex(reviews.map((r) => r.providerId));
  return c.json({ ok: true });
});
