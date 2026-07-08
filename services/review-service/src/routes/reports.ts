// Abuse reporting (#50) for reviews — this service owns reviews, so it owns
// the reports on them (provider profiles and work photos are reported at
// provider-service). The public endpoint takes an OPTIONAL session: anonymous
// visitors can report too; the gateway rate-limits it (the "report" budget).
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db";
import { logAudit } from "../lib/audit";
import { getAuth, isSupportOrAdmin } from "../lib/http";
import { normalizePagination, sliceOpenClosed } from "../lib/pagination";

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

const REPORT_STATUSES = ["OPEN", "RESOLVED", "DISMISSED"] as const;
// This queue only ever holds REVIEW reports — provider/work-photo reports
// live at provider-service. A PROVIDER/WORK_PHOTO filter is valid overall
// (the admin frontend offers it as one dropdown across both services) but
// never matches here, so it short-circuits to an empty list below.
const LOCAL_TARGET_TYPE = "REVIEW";

// OPEN reports first (newest first), then closed ones (newest first). Every
// report carries a hydrated target summary from the local Review table
// (rating, comment, provider/author ids); `target` is null when the review has
// since been hard-deleted (account erasure). Soft-deleted reviews still
// hydrate, flagged with removed=true, so an admin can see a report was already
// handled.
//
// Filtering (#223): optional `status` and `targetType` query params, passed
// straight through from the admin frontend's filter dropdowns. Unrecognized
// values are ignored (treated as "all").
//
// Pagination (#255): the OPEN group was previously unbounded (only the closed
// tail was capped). Now every response is a normalized page/pageSize window
// with `total`, matching provider-service's /api/admin/reports so the admin
// frontend can paginate the two merged queues in lockstep.
reports.get("/api/admin/review-reports", async (c) => {
  // Read access — open to the SUPPORT tier as well as full ADMIN (#226).
  if (!isSupportOrAdmin(c)) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const { page, pageSize } = normalizePagination({
    page: c.req.query("page") ?? null,
    pageSize: c.req.query("pageSize") ?? null,
  });
  const skip = (page - 1) * pageSize;

  const statusParam = c.req.query("status");
  const status = REPORT_STATUSES.find((s) => s === statusParam);
  const targetTypeParam = c.req.query("targetType");
  if (targetTypeParam && targetTypeParam !== LOCAL_TARGET_TYPE) {
    return c.json({ reports: [], total: 0, page, pageSize });
  }

  let total: number;
  let rows: Awaited<ReturnType<typeof db.report.findMany>>;
  if (status) {
    const where = { status };
    const [count, found] = await Promise.all([
      db.report.count({ where }),
      db.report.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
      }),
    ]);
    total = count;
    rows = found;
  } else {
    // No status filter: OPEN group first, then closed. Count each group so the
    // page window can be sliced across the two ordered queries.
    const [openTotal, closedTotal] = await Promise.all([
      db.report.count({ where: { status: "OPEN" } }),
      db.report.count({ where: { status: { not: "OPEN" } } }),
    ]);
    total = openTotal + closedTotal;
    const { openSkip, openTake, closedSkip, closedTake } = sliceOpenClosed(
      skip,
      pageSize,
      openTotal
    );
    const [openRows, closedRows] = await Promise.all([
      openTake > 0
        ? db.report.findMany({
            where: { status: "OPEN" },
            orderBy: { createdAt: "desc" },
            skip: openSkip,
            take: openTake,
          })
        : Promise.resolve([]),
      closedTake > 0
        ? db.report.findMany({
            where: { status: { not: "OPEN" } },
            orderBy: { createdAt: "desc" },
            skip: closedSkip,
            take: closedTake,
          })
        : Promise.resolve([]),
    ]);
    rows = [...openRows, ...closedRows];
  }

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

  return c.json({ reports: result, total, page, pageSize });
});

// Lightweight count for the admin hub notification badge (#233) — avoids
// shipping the full review-reports payload just to display a number. Paired
// with provider-service's GET /api/admin/notifications/counts, which the
// frontend sums client-side into the reports badge total.
reports.get("/api/admin/review-reports/count", async (c) => {
  if (!isSupportOrAdmin(c)) {
    return c.json({ error: "Forbidden" }, 403);
  }
  const openReports = await db.report.count({ where: { status: "OPEN" } });
  return c.json({ openReports });
});

const reportStatusSchema = z.object({ status: z.enum(["RESOLVED", "DISMISSED"]) });

reports.patch("/api/admin/review-reports/:id", async (c) => {
  // Resolve/dismiss is part of the SUPPORT tier (#226).
  const auth = getAuth(c);
  if (!isSupportOrAdmin(c)) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = reportStatusSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid input" }, 400);
  }

  const id = c.req.param("id");
  // Audit trail (#223): stamp who closed the report and when.
  const { count } = await db.report.updateMany({
    where: { id },
    data: {
      status: parsed.data.status,
      resolvedBy: auth?.userId ?? null,
      resolvedAt: new Date(),
    },
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

const batchReportStatusSchema = z.object({
  ids: z.array(z.string()).min(1).max(200),
  status: z.enum(["RESOLVED", "DISMISSED"]),
});

// Bulk resolve/dismiss (#231): batch variant of the single-report PATCH
// above, mirroring provider-service's /api/admin/reports batch endpoint, for
// the reports list's multi-select toolbar. Stamps resolvedBy/resolvedAt on
// every affected row, same as the single-report path (#223 audit trail).
reports.patch("/api/admin/review-reports", async (c) => {
  // Bulk resolve/dismiss is part of the SUPPORT tier (#226).
  const auth = getAuth(c);
  if (!isSupportOrAdmin(c)) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = batchReportStatusSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid input" }, 400);
  }

  const { count } = await db.report.updateMany({
    where: { id: { in: parsed.data.ids } },
    data: {
      status: parsed.data.status,
      resolvedBy: auth?.userId ?? null,
      resolvedAt: new Date(),
    },
  });
  return c.json({ ok: true, count });
});

// ---------------------------------------------------------------------------
// Audit log (#227): read-only history of every moderation write in this
// service (review delete/restore, report resolve/dismiss). provider-service
// keeps its own log for the actions it owns, exposed at
// GET /api/admin/audit-log — the admin frontend merges both.
// ---------------------------------------------------------------------------

const AUDIT_LOG_TAKE = 200;

reports.get("/api/admin/review-audit-log", async (c) => {
  if (!isSupportOrAdmin(c)) {
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

// ---------------------------------------------------------------------------
// Dashboard analytics (#219): open review-report count for the /admin home
// page's merged "open reports" metric — provider-service serves the other
// half (reports on providers/photos) at its own /api/admin/stats.
// ---------------------------------------------------------------------------

reports.get("/api/admin/review-stats", async (c) => {
  if (!isSupportOrAdmin(c)) {
    return c.json({ error: "Forbidden" }, 403);
  }
  const openReports = await db.report.count({ where: { status: "OPEN" } });
  return c.json({ openReports });
});
