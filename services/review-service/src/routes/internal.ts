import { Hono } from "hono";
import { db } from "../db";
import { listProviderReviews, normalizeTake } from "../lib/provider-reviews";
import { fetchRatingSummaries } from "../lib/rating-summary";
import { pushRatingsToSearchIndex } from "../lib/search-index";
import { removeStoredFile, sweepMedia } from "../lib/storage";

// Bound on how many ids a batch lookup will accept, so a caller (or attacker)
// can't force a single giant IN (...) clause. Matches the peer internal
// endpoints (identity/provider MAX_BATCH_IDS); extra ids past the cap are
// ignored.
const MAX_BATCH_IDS = 500;

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
    .filter(Boolean)
    .slice(0, MAX_BATCH_IDS);
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

// Page size for the orphan-sweep table walk (#766, matching provider-service's
// #639 pattern).
const SWEEP_PAGE_SIZE = 500;

// Periodic maintenance (#36): remove stored review-photo files no database
// row references any more. Grace window protects in-flight uploads; run it
// from ops tooling (cron/curl with the internal secret).
//
// The keep-list is streamed in id-ordered pages (#766) so no single findMany
// loads the whole reviewPhoto table at once; the referenced Set is still the
// full keep-list (unavoidable — sweepMedia deletes any stored object absent
// from it), but the DB round-trips now page by page.
internal.post("/maintenance/sweep-orphans", async (c) => {
  const referenced: string[] = [];
  let cursor: string | undefined;
  for (;;) {
    const rows = await db.reviewPhoto.findMany({
      select: { id: true, url: true },
      orderBy: { id: "asc" },
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      take: SWEEP_PAGE_SIZE,
    });
    for (const r of rows) referenced.push(r.url);
    if (rows.length < SWEEP_PAGE_SIZE) break;
    cursor = rows[rows.length - 1]!.id;
  }
  const result = await sweepMedia("review", referenced);
  return c.json(result);
});

// POST /internal/users/:id/erase — account-deletion fan-out from
// identity-service. Deletes the user's reviews (photo rows cascade) and their
// stored photo files (best-effort — removeStoredFile swallows errors).
//
// The user's public review replies (ReviewResponse) and the reviews they
// RECEIVED are keyed by their providerId, not their userId, so deleting only
// their authored reviews leaves both behind (#645). Their provider profile is
// being fully deleted by provider-service's erase, so those rows are orphaned
// PII: hard-delete the received reviews (their ReviewResponse replies + photo
// rows cascade).
//
// The providerId is supplied by the orchestrator in the request body — exactly
// as it does for the job erase — because only identity can resolve it (from the
// Provider row provider-service's erase later deletes). We no longer re-resolve
// it here over S2S: a transient provider blip used to make this endpoint
// degrade-open and return 200, so the orchestrator hard-deleted the Provider
// row and the received reviews were stranded forever with no retry (#749).
// A missing providerId now simply means "not a provider" — authored-only
// cleanup. Idempotent: erasing an unknown user is a no-op 200.
internal.post("/users/:id/erase", async (c) => {
  const userId = c.req.param("id");
  const body = (await c.req.json().catch(() => null)) as {
    providerId?: string;
  } | null;
  const providerId = body?.providerId ?? null;

  // Photo files to remove: authored reviews always, received reviews too when
  // the user owned a provider profile.
  const photoWhere = providerId
    ? { review: { OR: [{ userId }, { providerId }] } }
    : { review: { userId } };
  const [photos, reviews] = await Promise.all([
    db.reviewPhoto.findMany({ where: photoWhere, select: { url: true } }),
    // Captured before the delete so the search-index rating push below knows
    // which providers' aggregates just changed.
    db.review.findMany({ where: { userId }, select: { providerId: true } }),
  ]);

  await db.review.deleteMany({ where: { userId } });
  if (providerId) {
    // Cascades the ReviewResponse replies the user authored (they exist only
    // on reviews of their own profile) and the received reviews' photo rows.
    await db.review.deleteMany({ where: { providerId } });
  }
  for (const p of photos) {
    await removeStoredFile(p.url);
  }
  // Recount every OTHER provider whose aggregates changed from deleting the
  // user's authored reviews (search RFC §4.2, fire-and-forget; the helper
  // dedupes ids). The erased user's own provider is left out — its index
  // document is dropped by provider-service's erase.
  void pushRatingsToSearchIndex(
    reviews.map((r) => r.providerId).filter((id) => id !== providerId)
  );
  return c.json({ ok: true });
});
