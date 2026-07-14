// Public notification-center routes (RFC: stateful-notification-service),
// reached via the gateway with identity headers. Recipient-only access, any
// role (docs/AUTHZ.md): 401 without a session, and every query is scoped
// `WHERE userId = auth.userId` — ids belonging to someone else are silently
// no-ops, never a probe-able 403/404.
import { Hono, type Context } from "hono";
import { z } from "zod";
import { db } from "../db";
import { getAuth } from "../lib/http";
import { NOTIFICATION_TYPES } from "../lib/events";

export const notifications = new Hono();

export const DEFAULT_FEED_TAKE = 20;
export const MAX_FEED_TAKE = 50;

// Anything non-numeric or below 1 falls back to the default; the ceiling
// protects the query either way (same clamp shape as review-service).
export function normalizeTake(raw: string | null | undefined): number {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n) || n < 1) return DEFAULT_FEED_TAKE;
  return Math.min(n, MAX_FEED_TAKE);
}

// GET /api/notifications?take&cursor — own feed, newest first,
// cursor-paginated. Fetch one extra row to learn whether another page exists;
// (createdAt desc, id desc) keeps the order stable on timestamp collisions.
notifications.get("/api/notifications", async (c) => {
  const auth = getAuth(c);
  if (!auth) return c.json({ error: "Unauthorized" }, 401);

  const take = normalizeTake(c.req.query("take"));
  const cursor = c.req.query("cursor") || undefined;
  const rows = await db.notification.findMany({
    where: { userId: auth.userId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  const nextCursor = rows.length > take ? rows[take - 1].id : null;
  const page = rows.slice(0, take);

  return c.json({
    notifications: page.map((n) => ({
      id: n.id,
      type: n.type,
      payload: n.payload,
      link: n.link,
      readAt: n.readAt,
      createdAt: n.createdAt,
    })),
    nextCursor,
  });
});

// GET /api/notifications/unread-count — the bell badge (cheap indexed count).
notifications.get("/api/notifications/unread-count", async (c) => {
  const auth = getAuth(c);
  if (!auth) return c.json({ error: "Unauthorized" }, 401);
  const count = await db.notification.count({
    where: { userId: auth.userId, readAt: null },
  });
  return c.json({ count });
});

const readSchema = z
  .object({
    ids: z.array(z.string().min(1)).min(1).max(100).optional(),
    all: z.literal(true).optional(),
  })
  .refine((v) => v.all === true || (v.ids && v.ids.length > 0), {
    message: "ids or all required",
  });

async function readBody(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return null;
  }
}

// POST /api/notifications/read — { ids?: string[], all?: true }. Mark-read,
// own rows only, idempotent (already-read rows are skipped by the readAt
// filter, unknown/foreign ids simply match nothing).
notifications.post("/api/notifications/read", async (c) => {
  const auth = getAuth(c);
  if (!auth) return c.json({ error: "Unauthorized" }, 401);
  const parsed = readSchema.safeParse(await readBody(c));
  if (!parsed.success) return c.json({ error: "Invalid input" }, 400);

  const result = await db.notification.updateMany({
    where: {
      userId: auth.userId,
      readAt: null,
      ...(parsed.data.all ? {} : { id: { in: parsed.data.ids } }),
    },
    data: { readAt: new Date() },
  });
  return c.json({ ok: true, updated: result.count });
});

// GET /api/notification-preferences — the full type × channel matrix:
// defaults (both channels on) merged over the caller's stored sparse
// overrides, so the settings UI never has to know the catalog.
notifications.get("/api/notification-preferences", async (c) => {
  const auth = getAuth(c);
  if (!auth) return c.json({ error: "Unauthorized" }, 401);
  const rows = await db.notificationPreference.findMany({
    where: { userId: auth.userId },
  });
  const byType = new Map(rows.map((r) => [r.type, r]));
  return c.json({
    preferences: NOTIFICATION_TYPES.map((type) => ({
      type,
      emailEnabled: byType.get(type)?.emailEnabled ?? true,
      inAppEnabled: byType.get(type)?.inAppEnabled ?? true,
    })),
  });
});

const preferenceSchema = z
  .object({
    type: z.enum(NOTIFICATION_TYPES),
    emailEnabled: z.boolean().optional(),
    inAppEnabled: z.boolean().optional(),
  })
  .refine((v) => v.emailEnabled !== undefined || v.inAppEnabled !== undefined, {
    message: "at least one channel flag required",
  });

// POST /api/notification-preferences — upsert one override
// { type, emailEnabled?, inAppEnabled? }; omitted flags keep their stored (or
// default-on) value.
notifications.post("/api/notification-preferences", async (c) => {
  const auth = getAuth(c);
  if (!auth) return c.json({ error: "Unauthorized" }, 401);
  const parsed = preferenceSchema.safeParse(await readBody(c));
  if (!parsed.success) return c.json({ error: "Invalid input" }, 400);
  const { type, emailEnabled, inAppEnabled } = parsed.data;

  const row = await db.notificationPreference.upsert({
    where: { userId_type: { userId: auth.userId, type } },
    create: {
      userId: auth.userId,
      type,
      ...(emailEnabled !== undefined ? { emailEnabled } : {}),
      ...(inAppEnabled !== undefined ? { inAppEnabled } : {}),
    },
    update: {
      ...(emailEnabled !== undefined ? { emailEnabled } : {}),
      ...(inAppEnabled !== undefined ? { inAppEnabled } : {}),
    },
  });
  return c.json({
    preference: {
      type: row.type,
      emailEnabled: row.emailEnabled,
      inAppEnabled: row.inAppEnabled,
    },
  });
});
