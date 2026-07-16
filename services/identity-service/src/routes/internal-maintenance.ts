// Internal maintenance endpoint (secret already enforced by the global
// middleware in app.ts). Never routed by the gateway.
import { Hono } from "hono";
import { db } from "../db";
import { sweepMedia } from "../lib/storage";

export const internalMaintenanceRoutes = new Hono();

// Page size for the orphan-sweep table walk (#766, matching provider-service's
// #639 pattern).
const SWEEP_PAGE_SIZE = 500;

// Periodic maintenance (#555): remove stored `user`-namespace avatar files no
// User row references any more. Grace window protects in-flight uploads; run
// it from ops tooling (cron/curl with the internal secret), like the
// provider-/review-service equivalents.
//
// The keep-list is streamed in id-ordered pages (#766) so no single findMany
// loads the whole User table at once; the referenced list is still the full
// keep-list (unavoidable — sweepMedia deletes any stored object absent from
// it), but the DB round-trips now page by page.
internalMaintenanceRoutes.post("/internal/maintenance/sweep-orphans", async (c) => {
  const referenced: string[] = [];
  let cursor: string | undefined;
  for (;;) {
    const users = await db.user.findMany({
      where: { avatarUrl: { not: null } },
      select: { id: true, avatarUrl: true },
      orderBy: { id: "asc" },
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      take: SWEEP_PAGE_SIZE,
    });
    for (const u of users) referenced.push(u.avatarUrl as string);
    if (users.length < SWEEP_PAGE_SIZE) break;
    cursor = users[users.length - 1]!.id;
  }
  const result = await sweepMedia("user", referenced);
  return c.json(result);
});
