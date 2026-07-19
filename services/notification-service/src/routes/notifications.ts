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

// Mobile push device registry (#798). A user keeps at most this many device
// tokens; beyond the cap the stalest rows (lastSeenAt) are evicted, never an
// error — the newest device always wins.
export const MAX_DEVICE_TOKENS = 10;

// FCM registration tokens have no documented max length; 4096 bounds hostile
// input while leaving generous headroom over observed token sizes.
const deviceSchema = z.object({
  token: z.string().min(1).max(4096),
  platform: z.enum(["android", "ios"]),
});

// POST /api/notifications/devices — register (or re-register) this device's
// FCM token for the caller. Upsert by token: a device that signs into a
// different account MOVES its token to the new user (one device, one owner)
// instead of erroring; a repeat registration just bumps lastSeenAt
// (@updatedAt) so the cap eviction stays freshness-ordered.
notifications.post("/api/notifications/devices", async (c) => {
  const auth = getAuth(c);
  if (!auth) return c.json({ error: "Unauthorized" }, 401);
  const parsed = deviceSchema.safeParse(await readBody(c));
  if (!parsed.success) return c.json({ error: "Invalid input" }, 400);
  const { token, platform } = parsed.data;

  await db.deviceToken.upsert({
    where: { token },
    create: { userId: auth.userId, token, platform },
    // lastSeenAt is @updatedAt — Prisma bumps it on this write.
    update: { userId: auth.userId, platform },
  });

  // Enforce the per-user cap by evicting the stalest rows beyond it (id
  // tiebreak keeps the order stable on lastSeenAt collisions).
  const stale = await db.deviceToken.findMany({
    where: { userId: auth.userId },
    orderBy: [{ lastSeenAt: "desc" }, { id: "desc" }],
    skip: MAX_DEVICE_TOKENS,
    select: { id: true },
  });
  if (stale.length > 0) {
    await db.deviceToken.deleteMany({ where: { id: { in: stale.map((r) => r.id) } } });
  }
  return c.json({ ok: true });
});

const deviceDeleteSchema = z.object({ token: z.string().min(1).max(4096) });

// DELETE /api/notifications/devices — deregister on sign-out. Own row only,
// idempotent: unknown tokens and tokens now owned by another account match
// nothing (never a probe-able 403/404, like mark-read above).
notifications.delete("/api/notifications/devices", async (c) => {
  const auth = getAuth(c);
  if (!auth) return c.json({ error: "Unauthorized" }, 401);
  const parsed = deviceDeleteSchema.safeParse(await readBody(c));
  if (!parsed.success) return c.json({ error: "Invalid input" }, 400);

  await db.deviceToken.deleteMany({
    where: { token: parsed.data.token, userId: auth.userId },
  });
  return c.json({ ok: true });
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
