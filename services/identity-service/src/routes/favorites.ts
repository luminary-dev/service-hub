import { Hono } from "hono";
import { db } from "../db";
import { getAuth } from "../lib/http";
import { advisoryXactLock } from "../lib/locks";
import { log } from "../lib/log";
import { providerExists } from "../lib/providers";

export const favoritesRoutes = new Hono();

// Per-user cap (#647 L5): favoriting was previously unbounded — one account
// could accumulate rows without limit. A generous ceiling (a customer's
// shortlist, not a catalogue) that still bounds the per-user row growth.
export const MAX_FAVORITES = 100;

// GET /api/favorites — the caller's favorited provider ids, newest first.
favoritesRoutes.get("/", async (c) => {
  const auth = getAuth(c);
  if (!auth) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const favorites = await db.favorite.findMany({
    where: { userId: auth.userId },
    orderBy: { createdAt: "desc" },
    select: { providerId: true },
  });

  return c.json({ providerIds: favorites.map((f) => f.providerId) });
});

// POST /api/favorites/:id
favoritesRoutes.post("/:id", async (c) => {
  const auth = getAuth(c);
  if (!auth) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const id = c.req.param("id");

  // S2S existence check replaces the monolith's cross-table FK lookup.
  let exists: boolean;
  try {
    exists = await providerExists(id);
  } catch (e) {
    log.error("provider existence check failed", { context: "favorites", err: e });
    return c.json({ error: "Upstream service unavailable" }, 502);
  }
  if (!exists) {
    return c.json({ error: "Provider not found" }, 404);
  }

  // Cap only NEW favorites: re-favoriting an already-saved provider stays
  // idempotent (no new row, never capped). The existence check + count + insert
  // run inside one transaction under a per-user advisory lock so a concurrent
  // double-submit can't race the count check past MAX_FAVORITES (a plain
  // transaction wouldn't serialize the two — see lib/locks).
  const capped = await db.$transaction(async (tx) => {
    await advisoryXactLock(tx, "favorite", auth.userId);

    const already = await tx.favorite.findUnique({
      where: { userId_providerId: { userId: auth.userId, providerId: id } },
      select: { id: true },
    });
    if (already) return false;

    const count = await tx.favorite.count({ where: { userId: auth.userId } });
    if (count >= MAX_FAVORITES) return true;

    await tx.favorite.create({ data: { userId: auth.userId, providerId: id } });
    return false;
  });

  if (capped) {
    return c.json({ error: "Favorites limit reached" }, 429);
  }

  return c.json({ favorited: true });
});

// DELETE /api/favorites/:id
favoritesRoutes.delete("/:id", async (c) => {
  const auth = getAuth(c);
  if (!auth) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const id = c.req.param("id");
  await db.favorite.deleteMany({
    where: { userId: auth.userId, providerId: id },
  });

  return c.json({ favorited: false });
});
