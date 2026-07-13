// Abuse reporting (#376) for job posts — this service owns jobs, so it owns
// the reports on them (providers/photos are reported at provider-service,
// reviews at review-service). The public endpoint takes an OPTIONAL session:
// anonymous visitors can report too; the gateway rate-limits it (the "report"
// budget).
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

reports.post("/api/jobs/:id/report", async (c) => {
  const id = c.req.param("id");
  // Hidden (taken-down) jobs are invisible to the public, so they can't be
  // reported either — same 404 as a job that never existed.
  const job = await db.jobRequest.findUnique({
    where: { id },
    select: { id: true, hiddenAt: true },
  });
  if (!job || job.hiddenAt) {
    return c.json({ error: "Job not found" }, 404);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = reportSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid input" }, 400);
  }
  const { reason } = parsed.data;
  const details = parsed.data.details || null;

  // Duplicate protection: a signed-in user re-reporting the same job just
  // refreshes their existing OPEN report's reason/details — one queue entry
  // per (user, target). Anonymous reports have no identity to key on, so
  // duplicates are allowed (the rate limiter is the backstop).
  const auth = getAuth(c);
  if (auth) {
    const existing = await db.report.findFirst({
      where: {
        targetType: "JOB",
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
      targetType: "JOB",
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
// /api/admin/reports and review-service's /api/admin/review-reports, under
// its own path so the gateway can route by owner.
// ---------------------------------------------------------------------------

const REPORT_STATUSES = ["OPEN", "RESOLVED", "DISMISSED"] as const;
// This queue only ever holds JOB reports — provider/photo/message reports
// live at provider-service, review reports at review-service. Another filter
// value is valid overall (the admin frontend offers one dropdown across the
// three services) but never matches here, so it short-circuits to an empty
// list below.
const LOCAL_TARGET_TYPE = "JOB";

// OPEN reports first (newest first), then closed ones (newest first). Every
// report carries a hydrated target summary from the local JobRequest table
// (title, status, hidden flag); `target` is null when the job has since been
// hard-deleted (account erasure). Hidden jobs still hydrate, flagged with
// removed=true, so an admin can see a report was already handled.
//
// Filtering + pagination match the sibling queues: optional `status` /
// `targetType` query params, normalized page/pageSize window with `total`.
reports.get("/api/admin/job-reports", async (c) => {
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

  const jobIds = rows.map((r) => r.targetId);
  const jobs = jobIds.length
    ? await db.jobRequest.findMany({
        where: { id: { in: jobIds } },
        select: {
          id: true,
          title: true,
          status: true,
          hiddenAt: true,
        },
      })
    : [];
  const jobById = new Map(jobs.map((j) => [j.id, j]));

  const result = rows.map((r) => {
    const job = jobById.get(r.targetId);
    return {
      ...r,
      target: job
        ? {
            jobId: job.id,
            title: job.title,
            status: job.status,
            removed: job.hiddenAt !== null,
          }
        : null,
    };
  });

  return c.json({ reports: result, total, page, pageSize });
});

// Lightweight count for the admin hub notification badge — avoids shipping
// the full job-reports payload just to display a number. Summed client-side
// with provider-service's and review-service's counts into the reports badge
// total.
reports.get("/api/admin/job-reports/count", async (c) => {
  if (!isSupportOrAdmin(c)) {
    return c.json({ error: "Forbidden" }, 403);
  }
  const openReports = await db.report.count({ where: { status: "OPEN" } });
  return c.json({ openReports });
});

const reportStatusSchema = z.object({ status: z.enum(["RESOLVED", "DISMISSED"]) });

reports.patch("/api/admin/job-reports/:id", async (c) => {
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
  // Audit trail: stamp who closed the report and when.
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

// Bulk resolve/dismiss: batch variant of the single-report PATCH above,
// mirroring the sibling services' batch endpoints, for the reports list's
// multi-select toolbar. Stamps resolvedBy/resolvedAt on every affected row,
// same as the single-report path.
reports.patch("/api/admin/job-reports", async (c) => {
  const auth = getAuth(c);
  if (!isSupportOrAdmin(c)) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = batchReportStatusSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid input" }, 400);
  }

  const where = { id: { in: parsed.data.ids } };
  // Capture the ids actually matched before the write so the audit log records
  // real targets (unknown ids in the request list are skipped by updateMany).
  const affected = await db.report.findMany({ where, select: { id: true } });
  const { count } = await db.report.updateMany({
    where,
    data: {
      status: parsed.data.status,
      resolvedBy: auth?.userId ?? null,
      resolvedAt: new Date(),
    },
  });
  // Audit trail: one entry per affected report, mirroring the single-report
  // PATCH above so bulk actions leave the same trail.
  const action =
    parsed.data.status === "RESOLVED" ? "resolve-report" : "dismiss-report";
  await Promise.all(affected.map((r) => logAudit(c, action, "REPORT", r.id)));
  return c.json({ ok: true, count });
});

// ---------------------------------------------------------------------------
// Audit log: read-only history of every moderation write in this service
// (job hide/unhide, report resolve/dismiss). provider-service and
// review-service keep their own logs for the actions they own — the admin
// frontend merges all three.
// ---------------------------------------------------------------------------

const AUDIT_LOG_TAKE = 200;

reports.get("/api/admin/job-audit-log", async (c) => {
  if (!isSupportOrAdmin(c)) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const adminId = c.req.query("adminId") || undefined;
  const action = c.req.query("action") || undefined;
  const from = c.req.query("from");
  const to = c.req.query("to");

  // A date-only value (e.g. "2026-07-12") parses to midnight UTC. As a `gte`
  // lower bound that is exactly what we want, but as an `lte` upper bound it
  // would exclude every entry from the named day — so snap it to end-of-day
  // UTC. A full ISO datetime is honored verbatim on both bounds.
  const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

  const createdAt: { gte?: Date; lte?: Date } = {};
  if (from) {
    const d = new Date(from);
    if (!Number.isNaN(d.getTime())) createdAt.gte = d;
  }
  if (to) {
    const d = new Date(to);
    if (!Number.isNaN(d.getTime())) {
      if (DATE_ONLY.test(to)) d.setUTCHours(23, 59, 59, 999);
      createdAt.lte = d;
    }
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
