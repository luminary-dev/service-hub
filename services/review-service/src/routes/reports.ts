// Abuse reporting (#50) for reviews — this service owns reviews, so it owns
// the reports on them (provider profiles and work photos are reported at
// provider-service). The public endpoint takes an OPTIONAL session: anonymous
// visitors can report too; the gateway rate-limits it (the "report" budget).
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db";
import { logAudit } from "../lib/audit";
import { getAuth } from "../lib/http";

export const reports = new Hono();

export const REPORT_REASONS = ["spam", "scam", "offensive", "fake", "other"] as const;

const reportSchema = z.object({
  reason: z.enum(REPORT_REASONS),
  details: z.string().trim().max(500).optional().or(z.literal("")),
});

reports.post("/api/reviews/:id/report", async (c) => {
  const id = c.req.param("id");
  // Soft-deleted reviews are invisible to the public, so they can't be
  // reported either — same 404 as a review that never existed.
  const review = await db.review.findUnique({
    where: { id },
    select: { id: true, deletedAt: true },
  });
  if (!review || review.deletedAt) {
    return c.json({ error: "Review not found" }, 404);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = reportSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid input" }, 400);
  }
  const { reason } = parsed.data;
  const details = parsed.data.details || null;

  // Duplicate protection: a signed-in user re-reporting the same review just
  // refreshes their existing OPEN report's reason/details — one queue entry
  // per (user, target). Anonymous reports have no identity to key on, so
  // duplicates are allowed (the rate limiter is the backstop).
  const auth = getAuth(c);
  if (auth) {
    const existing = await db.report.findFirst({
      where: {
        targetType: "REVIEW",
        targetId: id,
        reporterId: auth.userId,
        status: "OPEN",
      },
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
      targetType: "REVIEW",
      targetId: id,
      reporterId: auth?.userId ?? null,
      reason,
      details,
    },
  });
  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Admin moderation queue — same shape and semantics as provider-service's
// /api/admin/reports, under its own path so the gateway can route by owner.
// ---------------------------------------------------------------------------

// The closed tail is bounded — the queue view is about what's OPEN; recently
// handled reports are kept for context, not as a full audit browser.
const CLOSED_REPORTS_TAKE = 100;

// OPEN reports first (newest first), then recently closed ones. Every report
// carries a hydrated target summary from the local Review table (rating,
// comment, provider/author ids); `target` is null when the review has since
// been hard-deleted (account erasure). Soft-deleted reviews still hydrate,
// flagged with removed=true, so an admin can see a report was already handled.
reports.get("/api/admin/review-reports", async (c) => {
  const auth = getAuth(c);
  if (auth?.role !== "ADMIN") {
    return c.json({ error: "Forbidden" }, 403);
  }

  const [open, closed] = await Promise.all([
    db.report.findMany({
      where: { status: "OPEN" },
      orderBy: { createdAt: "desc" },
    }),
    db.report.findMany({
      where: { status: { not: "OPEN" } },
      orderBy: { createdAt: "desc" },
      take: CLOSED_REPORTS_TAKE,
    }),
  ]);
  const rows = [...open, ...closed];

  const reviewIds = rows.map((r) => r.targetId);
  const reviews = reviewIds.length
    ? await db.review.findMany({
        where: { id: { in: reviewIds } },
        select: {
          id: true,
          rating: true,
          comment: true,
          providerId: true,
          userId: true,
          deletedAt: true,
        },
      })
    : [];
  const reviewById = new Map(reviews.map((r) => [r.id, r]));

  const result = rows.map((r) => {
    const review = reviewById.get(r.targetId);
    return {
      ...r,
      target: review
        ? {
            reviewId: review.id,
            rating: review.rating,
            comment: review.comment,
            providerId: review.providerId,
            authorId: review.userId,
            removed: review.deletedAt !== null,
          }
        : null,
    };
  });

  return c.json({ reports: result });
});

const reportStatusSchema = z.object({ status: z.enum(["RESOLVED", "DISMISSED"]) });

reports.patch("/api/admin/review-reports/:id", async (c) => {
  const auth = getAuth(c);
  if (auth?.role !== "ADMIN") {
    return c.json({ error: "Forbidden" }, 403);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = reportStatusSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid input" }, 400);
  }

  const id = c.req.param("id");
  const { count } = await db.report.updateMany({
    where: { id },
    data: { status: parsed.data.status },
  });
  if (count === 0) {
    return c.json({ error: "Report not found" }, 404);
  }
  await logAudit(
    c,
    parsed.data.status === "RESOLVED" ? "resolve-report" : "dismiss-report",
    "REPORT",
    id
  );
  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Audit log (#227): read-only history of every moderation write in this
// service (review delete/restore, report resolve/dismiss). provider-service
// keeps its own log for the actions it owns, exposed at
// GET /api/admin/audit-log — the admin frontend merges both.
// ---------------------------------------------------------------------------

const AUDIT_LOG_TAKE = 200;

reports.get("/api/admin/review-audit-log", async (c) => {
  const auth = getAuth(c);
  if (auth?.role !== "ADMIN") {
    return c.json({ error: "Forbidden" }, 403);
  }

  const adminId = c.req.query("adminId") || undefined;
  const action = c.req.query("action") || undefined;
  const from = c.req.query("from");
  const to = c.req.query("to");

  const createdAt: { gte?: Date; lte?: Date } = {};
  if (from) {
    const d = new Date(from);
    if (!Number.isNaN(d.getTime())) createdAt.gte = d;
  }
  if (to) {
    const d = new Date(to);
    if (!Number.isNaN(d.getTime())) createdAt.lte = d;
  }

  const entries = await db.adminAuditLog.findMany({
    where: {
      ...(adminId ? { adminId } : {}),
      ...(action ? { action } : {}),
      ...(createdAt.gte || createdAt.lte ? { createdAt } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: AUDIT_LOG_TAKE,
  });

  return c.json({ entries });
});
