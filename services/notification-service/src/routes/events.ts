// Generic marketplace-event ingestion (RFC: stateful-notification-service).
// One S2S endpoint replaces the per-event email routes for catalog events (the
// transactional auth mails keep their dedicated /internal/email/* routes — they
// are not notifications and take no preferences).
//
// Contract (folds in the #557 202-ack pattern): validate → load preference
// overrides for (recipients × type) → write in-app rows INLINE (durable even if
// Redis or Resend is down) → enqueue one email job per email-enabled recipient
// → ack 202 before any send. `email` is caller-supplied — every caller already
// holds the address, which keeps this service free of a synchronous identity
// dependency on the hot path. Recipients without an email get in-app only.
import { Hono, type Context } from "hono";
import { Prisma } from "@prisma/client";
import { db } from "../db";
import { getOrigin } from "../lib/http";
import {
  coerceLocale,
  dedupeRecipients,
  eventSchema,
  PAYLOAD_SCHEMAS,
} from "../lib/events";
import { hasEmailTemplate } from "../lib/event-email";
import { pushEnabled, type PushJob } from "../lib/push";
import { enqueueEmailJobs, enqueuePushJobs, type EmailJob } from "../lib/queue";
import { log } from "../lib/log";

export const eventRoutes = new Hono();

// Retention is opportunistic, not scheduled (no cron, no new infra): after
// each insert, drop READ notifications that are BOTH older than 90 days AND
// beyond the recipient's newest 200 rows. Unread rows are never swept.
const RETENTION_DAYS = 90;
const RETENTION_KEEP = 200;

// One batched sweep for the whole recipient set, not a serialized
// findMany+deleteMany per user (#637 — the old loop fired 2 queries per
// recipient, up to 400+ per event). A window function ranks each user's rows
// newest-first in a single statement; we hard-delete only the READ rows that
// are BOTH past the newest-RETENTION_KEEP window AND older than the cutoff.
// Rows inside the keep window and unread rows are never touched — same
// retention semantics as the old loop, at O(1) queries per event.
async function sweepRetention(userIds: string[]): Promise<void> {
  if (userIds.length === 0) return;
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  await db.$executeRaw`
    DELETE FROM "Notification"
    WHERE "id" IN (
      SELECT "id" FROM (
        SELECT "id",
          ROW_NUMBER() OVER (
            PARTITION BY "userId"
            ORDER BY "createdAt" DESC, "id" DESC
          ) AS rn
        FROM "Notification"
        WHERE "userId" IN (${Prisma.join(userIds)})
      ) ranked
      WHERE ranked.rn > ${RETENTION_KEEP}
    )
      AND "readAt" IS NOT NULL
      AND "createdAt" < ${cutoff}
  `;
}

async function readBody(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return null;
  }
}

eventRoutes.post("/events", async (c) => {
  const parsed = eventSchema.safeParse(await readBody(c));
  if (!parsed.success) return c.json({ error: "Invalid input" }, 400);
  const { type, link } = parsed.data;

  const payload = PAYLOAD_SCHEMAS[type].safeParse(parsed.data.payload);
  if (!payload.success) return c.json({ error: "Invalid input" }, 400);

  const recipients = dedupeRecipients(parsed.data.recipients);
  const userIds = recipients.map((r) => r.userId);

  // Sparse overrides: no row = both channels on.
  const prefs = await db.notificationPreference.findMany({
    where: { type, userId: { in: userIds } },
  });
  const prefByUser = new Map(prefs.map((p) => [p.userId, p]));

  const inAppUserIds = userIds.filter(
    (id) => prefByUser.get(id)?.inAppEnabled !== false
  );
  if (inAppUserIds.length > 0) {
    // Inline, before the ack — the in-app row is the durable half of the
    // fan-out and must not depend on Redis or Resend being up.
    await db.notification.createMany({
      data: inAppUserIds.map((userId) => ({
        userId,
        type,
        payload: payload.data as object,
        link,
      })),
    });
  }

  // Email jobs carry an absolute URL rebuilt from the gateway's x-origin.
  // Types without an email template (REPORT_RESOLVED — in-app only in v1)
  // enqueue nothing.
  const origin = getOrigin(c);
  const jobs: EmailJob[] = !hasEmailTemplate(type)
    ? []
    : recipients
        .filter((r) => r.email && prefByUser.get(r.userId)?.emailEnabled !== false)
        .map((r) => ({
          type,
          to: r.email as string,
          locale: coerceLocale(r.locale),
          payload: payload.data as Record<string, unknown>,
          link: `${origin}${link}`,
          attempt: 0,
        }));
  await enqueueEmailJobs(jobs);

  // Mobile push (#798) follows the IN-APP preference — a recipient who muted
  // a type's in-app channel gets no push for it either; there is no separate
  // push toggle in v1. The device-token lookup + enqueue run OFF the 202 hot
  // path (like the retention sweep below): the ack never waits on them, and a
  // Redis/FCM failure only logs. Without FCM config pushEnabled() is false
  // and this whole block is a no-op.
  if (pushEnabled() && inAppUserIds.length > 0) {
    const localeByUser = new Map(recipients.map((r) => [r.userId, coerceLocale(r.locale)]));
    const pushLink = `${origin}${link}`;
    void (async () => {
      const devices = await db.deviceToken.findMany({
        where: { userId: { in: inAppUserIds } },
        select: { userId: true, token: true },
      });
      const tokensByUser = new Map<string, string[]>();
      for (const d of devices) {
        const list = tokensByUser.get(d.userId);
        if (list) list.push(d.token);
        else tokensByUser.set(d.userId, [d.token]);
      }
      // One job per recipient WITH devices (most users have none — enqueue
      // nothing for them), carrying the tokens so the worker needs no lookup.
      const pushJobs: PushJob[] = [...tokensByUser.entries()].map(([userId, tokens]) => ({
        kind: "push",
        type,
        tokens,
        locale: localeByUser.get(userId) ?? "en",
        payload: payload.data as Record<string, unknown>,
        link: pushLink,
      }));
      await enqueuePushJobs(pushJobs);
    })().catch((err) => {
      log.error("push fan-out failed", { err });
    });
  }

  // Opportunistic retention, off the hot path — the ack never waits on it.
  void sweepRetention(inAppUserIds).catch((err) => {
    log.error("notification retention sweep failed", { err });
  });

  return c.json({ ok: true, accepted: recipients.length }, 202);
});

// POST /internal/users/:id/erase — account-deletion fan-out from
// identity-service (same contract as provider/review/job). Deletes the user's
// notifications, preference overrides and push device tokens (#798).
// Idempotent: erasing an unknown user is a no-op 200.
export const internalUsers = new Hono();

internalUsers.post("/:id/erase", async (c) => {
  const userId = c.req.param("id");
  await db.notification.deleteMany({ where: { userId } });
  await db.notificationPreference.deleteMany({ where: { userId } });
  await db.deviceToken.deleteMany({ where: { userId } });
  return c.json({ ok: true });
});
