// Public abuse reporting (#50) for content this service owns: provider
// profiles, work photos and inquiry thread messages (#376) — reviews are
// reported at review-service, jobs at job-service. Session is OPTIONAL on
// the public targets — anonymous visitors can report too; the gateway
// rate-limits these endpoints (the "report" budget) to blunt drive-by spam.
// Thread messages are private, so their report route additionally requires
// the caller to be a thread party.
import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";
import { db } from "../db";
import { getAuth } from "../lib/http";
import { resolveThreadParty } from "../lib/thread-access";

export const reportsRoutes = new Hono();

export const REPORT_REASONS = ["spam", "scam", "offensive", "fake", "other"] as const;

const reportSchema = z.object({
  reason: z.enum(REPORT_REASONS),
  details: z.string().trim().max(500).optional().or(z.literal("")),
});

// Shared create path. Duplicate protection: a signed-in user re-reporting the
// same target just refreshes their existing OPEN report's reason/details —
// one queue entry per (user, target). Anonymous reports have no identity to
// key on, so duplicates are allowed (the rate limiter is the backstop).
async function fileReport(
  c: Context,
  targetType: "PROVIDER" | "WORK_PHOTO" | "MESSAGE",
  targetId: string
) {
  const body = await c.req.json().catch(() => null);
  const parsed = reportSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid input" }, 400);
  }
  const { reason } = parsed.data;
  const details = parsed.data.details || null;

  const auth = getAuth(c);
  if (auth) {
    const existing = await db.report.findFirst({
      where: { targetType, targetId, reporterId: auth.userId, status: "OPEN" },
    });
    if (existing) {
      await db.report.update({
        where: { id: existing.id },
        data: { reason, details },
      });
      return c.json({ ok: true });
    }
  }

  await db.report.create({
    data: {
      targetType,
      targetId,
      reporterId: auth?.userId ?? null,
      reason,
      details,
    },
  });
  return c.json({ ok: true });
}

reportsRoutes.post("/api/providers/:id/report", async (c) => {
  const id = c.req.param("id");
  const provider = await db.provider.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!provider) {
    return c.json({ error: "Provider not found" }, 404);
  }
  return fileReport(c, "PROVIDER", id);
});

reportsRoutes.post("/api/photos/:id/report", async (c) => {
  const id = c.req.param("id");
  const photo = await db.workPhoto.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!photo) {
    return c.json({ error: "Photo not found" }, 404);
  }
  return fileReport(c, "WORK_PHOTO", id);
});

// Inquiry thread messages (#376). Unlike the public targets above, a thread
// is private to its two parties, so only they may report a message — anyone
// else (including signed-out callers) gets the same 404 as a message that
// never existed, to avoid confirming message ids. Messages already removed
// by moderation are invisible in the thread and can't be re-reported.
reportsRoutes.post("/api/messages/:id/report", async (c) => {
  const id = c.req.param("id");
  const message = await db.inquiryMessage.findUnique({
    where: { id },
    select: {
      id: true,
      deletedAt: true,
      inquiry: {
        select: { userId: true, provider: { select: { userId: true } } },
      },
    },
  });
  const party = message ? resolveThreadParty(message.inquiry, getAuth(c)) : null;
  if (!message || message.deletedAt || !party) {
    return c.json({ error: "Message not found" }, 404);
  }
  return fileReport(c, "MESSAGE", id);
});
