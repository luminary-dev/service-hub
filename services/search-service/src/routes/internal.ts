// Internal endpoints for sibling services (already behind the internal-secret
// middleware). Never routed by the gateway. Ingestion is push-based (RFC §4.2):
// provider-service PUTs full documents from every indexed write and
// review-service POSTs rating patches; the reindex sweep self-heals drift.
import { Hono } from "hono";
import { db } from "../db";
import {
  deleteDocument,
  indexDocumentSchema,
  patchRatings,
  ratingPatchSchema,
  upsertDocument,
} from "../lib/documents";
import { runReindex } from "../lib/reindex";
import { log } from "../lib/log";

export const internalRoutes = new Hono();

// Full-document upsert (idempotent, last-write-wins on the source updatedAt).
// provider-service pushes fire-and-forget, so failures here surface only in
// its logs — the sweep is the safety net either way.
internalRoutes.put("/internal/search/providers/:id", async (c) => {
  const providerId = c.req.param("id");
  const parsed = indexDocumentSchema.safeParse(
    await c.req.json().catch(() => null)
  );
  if (!parsed.success) {
    return c.json({ error: "Invalid input" }, 400);
  }
  await upsertDocument(providerId, parsed.data);
  return c.json({ ok: true });
});

// Removal (suspension, self-deactivation, erasure). Idempotent — deleting an
// unindexed provider is a no-op 200. Writes a delete tombstone (#752) so a
// stale push landing after this DELETE can't resurrect the row.
internalRoutes.delete("/internal/search/providers/:id", async (c) => {
  await deleteDocument(c.req.param("id"));
  return c.json({ ok: true });
});

// Rating-aggregate patch from review-service (create/edit/moderation/erase).
// No-op when the provider isn't indexed yet — the sweep reconciles.
internalRoutes.post("/internal/search/ratings", async (c) => {
  const parsed = ratingPatchSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: "Invalid input" }, 400);
  }
  await patchRatings(parsed.data);
  return c.json({ ok: true });
});

// Full-reindex sweep (self-heal, ops-cron daily — see docs/OPERATIONS.md).
// Fails loudly on a peer outage rather than mistaking it for an empty source.
internalRoutes.post("/internal/search/reindex", async (c) => {
  try {
    const result = await runReindex();
    log.info("reindex complete", result);
    return c.json(result);
  } catch (e) {
    log.error("reindex failed", { err: e });
    return c.json({ error: "Reindex failed" }, 502);
  }
});

// Drift metric for the ops runbook: compare against provider-service's
// non-suspended count to spot missed pushes between sweeps.
internalRoutes.get("/internal/search/stats", async (c) => {
  const [indexed, pinned] = await Promise.all([
    db.providerIndex.count(),
    db.providerIndex.count({ where: { latitude: { not: null } } }),
  ]);
  return c.json({ indexed, pinned });
});
