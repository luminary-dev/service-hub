// Public abuse reporting (#50) for content this service owns: provider
// profiles and work photos (reviews are reported at review-service). Session
// is OPTIONAL — anonymous visitors can report too; the gateway rate-limits
// these endpoints (the "report" budget) to blunt drive-by spam.
import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";
import { db } from "../db";
import { getAuth } from "../lib/http";

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
  targetType: "PROVIDER" | "WORK_PHOTO",
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
