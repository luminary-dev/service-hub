import { Hono } from "hono";
import { db } from "../db";
import { getAuth } from "../lib/http";
import { log } from "../lib/log";
import { providerExists } from "../lib/providers";

export const favoritesRoutes = new Hono();

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

  await db.favorite.upsert({
    where: { userId_providerId: { userId: auth.userId, providerId: id } },
    create: { userId: auth.userId, providerId: id },
    update: {},
  });

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
