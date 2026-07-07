// Abuse reporting (#50) for reviews — this service owns reviews, so it owns
// the reports on them (provider profiles and work photos are reported at
// provider-service). The public endpoint takes an OPTIONAL session: anonymous
// visitors can report too; the gateway rate-limits it (the "report" budget).
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db";
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

const REPORT_STATUSES = ["OPEN", "RESOLVED", "DISMISSED"] as const;
// This queue only ever holds REVIEW reports — provider/work-photo reports
// live at provider-service. A PROVIDER/WORK_PHOTO filter is valid overall
// (the admin frontend offers it as one dropdown across both services) but
// never matches here, so it short-circuits to an empty list below.
const LOCAL_TARGET_TYPE = "REVIEW";

// OPEN reports first (newest first), then recently closed ones. Every report
// carries a hydrated target summary from the local Review table (rating,
// comment, provider/author ids); `target` is null when the review has since
// been hard-deleted (account erasure). Soft-deleted reviews still hydrate,
// flagged with removed=true, so an admin can see a report was already handled.
//
// Filtering (#223): optional `status` and `targetType` query params, passed
// straight through from the admin frontend's filter dropdowns. Unrecognized
// values are ignored (treated as "all").
reports.get("/api/admin/review-reports", async (c) => {
  const auth = getAuth(c);
  if (auth?.role !== "ADMIN") {
    return c.json({ error: "Forbidden" }, 403);
  }

  const statusParam = c.req.query("status");
  const status = REPORT_STATUSES.find((s) => s === statusParam);
  const targetTypeParam = c.req.query("targetType");
  if (targetTypeParam && targetTypeParam !== LOCAL_TARGET_TYPE) {
    return c.json({ reports: [] });
  }

  const rows = status
    ? await db.report.findMany({
        where: { status },
        orderBy: { createdAt: "desc" },
        ...(status === "OPEN" ? {} : { take: CLOSED_REPORTS_TAKE }),
      })
    : await Promise.all([
        db.report.findMany({
          where: { status: "OPEN" },
          orderBy: { createdAt: "desc" },
        }),
        db.report.findMany({
          where: { status: { not: "OPEN" } },
          orderBy: { createdAt: "desc" },
          take: CLOSED_REPORTS_TAKE,
        }),
      ]).then(([open, closed]) => [...open, ...closed]);

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

// Lightweight count for the admin hub notification badge (#233) — avoids
// shipping the full review-reports payload just to display a number. Paired
// with provider-service's GET /api/admin/notifications/counts, which the
// frontend sums client-side into the reports badge total.
reports.get("/api/admin/review-reports/count", async (c) => {
  const auth = getAuth(c);
  if (auth?.role !== "ADMIN") {
    return c.json({ error: "Forbidden" }, 403);
  }
  const openReports = await db.report.count({ where: { status: "OPEN" } });
  return c.json({ openReports });
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

  // Audit trail (#223): stamp who closed the report and when.
  const { count } = await db.report.updateMany({
    where: { id: c.req.param("id") },
    data: {
      status: parsed.data.status,
      resolvedBy: auth?.userId ?? null,
      resolvedAt: new Date(),
    },
  });
  if (count === 0) {
    return c.json({ error: "Report not found" }, 404);
  }
  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Dashboard analytics (#219): open review-report count for the /admin home
// page's merged "open reports" metric — provider-service serves the other
// half (reports on providers/photos) at its own /api/admin/stats.
// ---------------------------------------------------------------------------

reports.get("/api/admin/review-stats", async (c) => {
  const auth = getAuth(c);
  if (auth?.role !== "ADMIN") {
    return c.json({ error: "Forbidden" }, 403);
  }
  const openReports = await db.report.count({ where: { status: "OPEN" } });
  return c.json({ openReports });
});
