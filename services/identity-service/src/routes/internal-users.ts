// Internal endpoints consumed by sibling services (secret already enforced by
// the global middleware in app.ts).
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db";

export const internalUsersRoutes = new Hono();

// Bound the batch so a large caller list can't produce an unbounded
// `IN (...)`. Mirrors provider-service's MAX_BATCH_IDS; callers that need more
// must page. Extra ids beyond the cap are ignored (deduped first).
const MAX_BATCH_IDS = 500;

// GET /internal/users?ids=a,b,c — batch hydration (reviewer / customer names).
internalUsersRoutes.get("/", async (c) => {
  const ids = [
    ...new Set(
      (c.req.query("ids") ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    ),
  ].slice(0, MAX_BATCH_IDS);

  const users = ids.length
    ? await db.user.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          emailVerified: true,
        },
      })
    : [];

  return c.json({ users });
});

// GET /internal/users/:id/session-version — gateway revocation check: the
// current sessionVersion for a user, null when the user no longer exists.
internalUsersRoutes.get("/:id/session-version", async (c) => {
  const user = await db.user.findUnique({
    where: { id: c.req.param("id") },
    select: { sessionVersion: true },
  });
  return c.json({ v: user?.sessionVersion ?? null });
});

// GET /internal/users/count — unused today, kept cheap per the architecture.
internalUsersRoutes.get("/count", async (c) => {
  const count = await db.user.count();
  return c.json({ count });
});

// PATCH /internal/users/:id — profile sync from provider-service.
const patchSchema = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().optional(),
});

internalUsersRoutes.patch("/:id", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid input" }, 400);
  }

  const data: { name?: string; phone?: string } = {};
  if (parsed.data.name !== undefined) data.name = parsed.data.name;
  if (parsed.data.phone !== undefined) data.phone = parsed.data.phone;

  await db.user.updateMany({
    where: { id: c.req.param("id") },
    data,
  });

  return c.json({ ok: true });
});
