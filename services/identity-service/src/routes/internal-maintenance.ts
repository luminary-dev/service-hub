// Internal maintenance endpoint (secret already enforced by the global
// middleware in app.ts). Never routed by the gateway.
import { Hono } from "hono";
import { db } from "../db";
import { sweepMedia } from "../lib/storage";

export const internalMaintenanceRoutes = new Hono();

// Periodic maintenance (#555): remove stored `user`-namespace avatar files no
// User row references any more. Grace window protects in-flight uploads; run
// it from ops tooling (cron/curl with the internal secret), like the
// provider-/review-service equivalents.
internalMaintenanceRoutes.post("/internal/maintenance/sweep-orphans", async (c) => {
  const users = await db.user.findMany({
    where: { avatarUrl: { not: null } },
    select: { avatarUrl: true },
  });
  const result = await sweepMedia(
    "user",
    users.map((u) => u.avatarUrl as string)
  );
  return c.json(result);
});
