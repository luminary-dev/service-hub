// Abuse reporting for content this service owns: job posts and job
// responses. Reports arrive two ways — the public report-a-job endpoint
// below (#376: session OPTIONAL, anonymous visitors can report too; the
// gateway rate-limits it on the shared "report" budget) and SYSTEM rows
// auto-created by the write-time content filter (#375). The admin queue has
// the same shape and semantics as provider-service's /api/admin/reports and
// review-service's /api/admin/review-reports, under its own path so the
// gateway can route by owner.
import { Prisma } from "@prisma/client";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db";
import { logAudit } from "../lib/audit";
import { getAuth, isSupportOrAdmin } from "../lib/http";
import { emitNotification } from "../lib/notify";
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

  try {
    await db.report.create({
      data: {
        targetType: "JOB",
        targetId: id,
        reporterId: auth?.userId ?? null,
        reason,
        details,
      },
    });
  } catch (e) {
    // Lost the race with a concurrent report from the same user for the same
    // job: the partial unique index `Report_open_reporter_key` (#651) fired.
    // The other request already filed the OPEN report, so this is idempotent
    // success, not a 500.
    if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) {
      throw e;
    }
  }
  return c.json({ ok: true });
});

const REPORT_STATUSES = ["OPEN", "RESOLVED", "DISMISSED"] as const;
// This queue only ever holds JOB/JOB_RESPONSE reports — the other target
// types live at provider-service / review-service. A foreign filter is valid
// overall (the admin frontend offers one dropdown across all sources) but
// never matches here, so it short-circuits to an empty list below.
const LOCAL_TARGET_TYPES = ["JOB", "JOB_RESPONSE"] as const;

// OPEN reports first (newest first), then closed ones (newest first), as one
// page/pageSize window with `total` — identical pagination contract to the
// sibling queues so the admin frontend can page the merged list in lockstep.
// Every report carries a hydrated target summary from local tables (job
// title/description for JOB, response message + its job for JOB_RESPONSE);
// `target` is null when the target has since been hard-deleted.
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
  if (
    targetTypeParam &&
    !LOCAL_TARGET_TYPES.includes(targetTypeParam as never)
  ) {
    return c.json({ reports: [], total: 0, page, pageSize });
  }
  const targetType = targetTypeParam as
    | (typeof LOCAL_TARGET_TYPES)[number]
    | undefined;
  const targetFilter = targetType ? { targetType } : {};

  let total: number;
  let rows: Awaited<ReturnType<typeof db.report.findMany>>;
  if (status) {
    const where = { status, ...targetFilter };
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
    const openWhere = { status: "OPEN", ...targetFilter };
    const closedWhere = { status: { not: "OPEN" }, ...targetFilter };
    const [openTotal, closedTotal] = await Promise.all([
      db.report.count({ where: openWhere }),
      db.report.count({ where: closedWhere }),
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
            where: openWhere,
            orderBy: { createdAt: "desc" },
            skip: openSkip,
            take: openTake,
          })
        : Promise.resolve([]),
      closedTake > 0
        ? db.report.findMany({
            where: closedWhere,
            orderBy: { createdAt: "desc" },
            skip: closedSkip,
            take: closedTake,
          })
        : Promise.resolve([]),
    ]);
    rows = [...openRows, ...closedRows];
  }

  const jobIds = rows.filter((r) => r.targetType === "JOB").map((r) => r.targetId);
  const responseIds = rows
    .filter((r) => r.targetType === "JOB_RESPONSE")
    .map((r) => r.targetId);
  const [jobRows, responseRows] = await Promise.all([
    jobIds.length
      ? db.jobRequest.findMany({
          where: { id: { in: jobIds } },
          select: {
            id: true,
            title: true,
            description: true,
            status: true,
            hiddenAt: true,
          },
        })
      : [],
    responseIds.length
      ? db.jobResponse.findMany({
          where: { id: { in: responseIds } },
          select: {
            id: true,
            message: true,
            providerId: true,
            jobRequestId: true,
            jobRequest: { select: { title: true } },
          },
        })
      : [],
  ]);
  const jobById = new Map(jobRows.map((j) => [j.id, j]));
  const responseById = new Map(responseRows.map((r) => [r.id, r]));

  const result = rows.map((r) => {
    let target = null;
    if (r.targetType === "JOB") {
      const job = jobById.get(r.targetId);
      if (job) {
        target = {
          jobId: job.id,
          title: job.title,
          description: job.description,
          status: job.status,
          // Taken down by an admin (#376) — reversible soft-hide.
          removed: job.hiddenAt !== null,
        };
      }
    } else {
      const response = responseById.get(r.targetId);
      if (response) {
        target = {
          jobId: response.jobRequestId,
          jobTitle: response.jobRequest.title,
          message: response.message,
          providerId: response.providerId,
        };
      }
    }
    return { ...r, target };
  });

  return c.json({ reports: result, total, page, pageSize });
});

// Lightweight count for the admin hub notification badge (#233 convention) —
// summed client-side with the provider- and review-service counts.
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
  // Loaded before the write so the resolve notification below can address the
  // reporter (updateMany returns only a count).
  const report = await db.report.findUnique({
    where: { id },
    select: { reporterId: true, targetType: true },
  });
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
  // Tell the reporter their report was actioned — in-app only in v1 (no email
  // template); anonymous and SYSTEM reports carry no reporterId and skip.
  if (report?.reporterId) {
    await emitNotification({
      type: "REPORT_RESOLVED",
      recipients: [{ userId: report.reporterId }],
      payload: { targetType: report.targetType, status: parsed.data.status },
      link: "/",
    });
  }
  return c.json({ ok: true });
});

const batchReportStatusSchema = z.object({
  ids: z.array(z.string()).min(1).max(200),
  status: z.enum(["RESOLVED", "DISMISSED"]),
});

// Bulk resolve/dismiss (#231 convention): batch variant of the single-report
// PATCH above, for the reports list's multi-select toolbar. Stamps
// resolvedBy/resolvedAt on every affected row, same as the single path.
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
  // real targets (unknown ids in the request list are skipped by updateMany)
  // and the resolve notifications below can address the reporters.
  const affected = await db.report.findMany({
    where,
    select: { id: true, reporterId: true, targetType: true },
  });
  const { count } = await db.report.updateMany({
    where,
    data: {
      status: parsed.data.status,
      resolvedBy: auth?.userId ?? null,
      resolvedAt: new Date(),
    },
  });
  // Audit trail (#227 convention): one entry per affected report.
  const action =
    parsed.data.status === "RESOLVED" ? "resolve-report" : "dismiss-report";
  await Promise.all(affected.map((r) => logAudit(c, action, "REPORT", r.id)));
  // Tell the reporters (in-app only in v1): the payload carries the target
  // type (JOB or JOB_RESPONSE here), so batch one event per type;
  // anonymous/SYSTEM reports skip.
  const reportersByTargetType = new Map<string, string[]>();
  for (const r of affected) {
    if (!r.reporterId) continue;
    const list = reportersByTargetType.get(r.targetType) ?? [];
    list.push(r.reporterId);
    reportersByTargetType.set(r.targetType, list);
  }
  for (const [targetType, userIds] of reportersByTargetType) {
    await emitNotification({
      type: "REPORT_RESOLVED",
      recipients: userIds.map((userId) => ({ userId })),
      payload: { targetType, status: parsed.data.status },
      link: "/",
    });
  }
  return c.json({ ok: true, count });
});

// ---------------------------------------------------------------------------
// Audit log: read-only history of every moderation write in this service
// (job-report resolve/dismiss). Same contract as review-service's
// /api/admin/review-audit-log — the admin frontend merges all three logs.
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
