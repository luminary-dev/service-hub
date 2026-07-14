// Unified admin moderation surface (trust & safety extraction RFC §5.2):
// ONE reports queue / count / resolve surface across all seven target types,
// replacing the three per-service queues the admin frontend used to merge
// client-side, plus the unified audit log and the takedown/restore action
// route. Reads and report resolve/dismiss are open to the SUPPORT tier
// (isSupportOrAdmin, #226); the destructive action route requires full ADMIN.
//
// DARK LAUNCH: the gateway still routes /api/admin/reports* and
// /api/admin/audit-log to provider-service; nothing reaches these handlers in
// production until the cutover PR flips the routing.
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db";
import { logAudit } from "../lib/audit";
import { getAuth, isFullAdmin, isSupportOrAdmin, s2s } from "../lib/http";
import { log } from "../lib/log";
import {
  ACTION_SEGMENT_BY_TARGET_TYPE,
  OWNER_BY_TARGET_TYPE,
  TARGET_TYPES,
  ownerServiceUrl,
  type OwnerService,
  type TargetType,
} from "../lib/owners";
import { normalizePagination, sliceOpenClosed } from "../lib/pagination";

export const admin = new Hono();

const REPORT_STATUSES = ["OPEN", "RESOLVED", "DISMISSED"] as const;

// ---------------------------------------------------------------------------
// Target hydration (RFC §5.2): the queue hydrates rows per page via batched
// S2S reads, one call per (owner, targetType) —
//   GET /internal/moderation/targets?type=<T>&ids=a,b → { targets: { [id]: summary | null } }
// returning the same per-type `target` summaries the three queues built from
// their local tables. Owner outage (or, during the dark launch, the endpoint
// not existing yet) degrades that slice to target: null — exactly how a
// hard-deleted target renders today. Read path: never fails the queue.
// ---------------------------------------------------------------------------

type ReportRow = Awaited<ReturnType<typeof db.report.findMany>>[number];

async function hydrateTargets(
  rows: ReportRow[]
): Promise<Map<string, unknown>> {
  const byType = new Map<TargetType, string[]>();
  for (const r of rows) {
    const type = r.targetType as TargetType;
    if (!OWNER_BY_TARGET_TYPE[type]) continue;
    const ids = byType.get(type) ?? [];
    if (!ids.includes(r.targetId)) ids.push(r.targetId);
    byType.set(type, ids);
  }

  const hydrated = new Map<string, unknown>();
  await Promise.all(
    [...byType.entries()].map(async ([type, ids]) => {
      try {
        const res = await s2s(
          ownerServiceUrl(OWNER_BY_TARGET_TYPE[type]),
          `/internal/moderation/targets?type=${type}&ids=${ids
            .map(encodeURIComponent)
            .join(",")}`
        );
        if (!res.ok) return;
        const body = (await res.json()) as {
          targets?: Record<string, unknown>;
        };
        for (const [id, target] of Object.entries(body.targets ?? {})) {
          hydrated.set(`${type}:${id}`, target);
        }
      } catch (e) {
        // Degrade this slice to target: null (deleted-target rendering).
        log.warn("target hydration degraded", { type, err: e });
      }
    })
  );
  return hydrated;
}

// OPEN reports first (newest first), then closed ones (newest first), as one
// page/pageSize window with `total` — the identical pagination contract the
// three per-service queues shared, but over the whole report set, so admin
// paging is finally a real server-side page instead of three interleaved ones.
// Filtering (#223): optional `status` and `targetType` query params;
// unrecognized values are ignored (treated as "all") — and a `targetType`
// filter now actually filters instead of short-circuiting foreign types to an
// empty list.
admin.get("/api/admin/reports", async (c) => {
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
  const targetType = TARGET_TYPES.find((t) => t === targetTypeParam);
  const targetFilter = targetType ? { targetType } : {};

  let total: number;
  let rows: ReportRow[];
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

  const targets = await hydrateTargets(rows);
  const result = rows.map((r) => ({
    ...r,
    target: targets.get(`${r.targetType}:${r.targetId}`) ?? null,
  }));

  return c.json({ reports: result, total, page, pageSize });
});

// Lightweight count for the admin hub notification badge (#233): the ONE
// open-reports figure, replacing the three per-service counts the frontend
// summed client-side.
admin.get("/api/admin/reports/count", async (c) => {
  if (!isSupportOrAdmin(c)) {
    return c.json({ error: "Forbidden" }, 403);
  }
  const openReports = await db.report.count({ where: { status: "OPEN" } });
  return c.json({ openReports });
});

const reportStatusSchema = z.object({ status: z.enum(["RESOLVED", "DISMISSED"]) });

admin.patch("/api/admin/reports/:id", async (c) => {
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
// above, for the reports list's multi-select toolbar. Stamps
// resolvedBy/resolvedAt on every affected row, same as the single path.
admin.patch("/api/admin/reports", async (c) => {
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
  // Audit trail (#227): one entry per affected report, mirroring the
  // single-report PATCH above so bulk actions leave the same trail.
  const action =
    parsed.data.status === "RESOLVED" ? "resolve-report" : "dismiss-report";
  await Promise.all(affected.map((r) => logAudit(c, action, "REPORT", r.id)));
  return c.json({ ok: true, count });
});

// ---------------------------------------------------------------------------
// Takedown/restore orchestration (RFC §3, Option A): the content mutation
// stays in the owning service behind an internal endpoint —
//   POST /internal/moderation/<segment>/:id/<takedown|restore>
// — which this route calls over s2s(). Full ADMIN only (destructive), checked
// BEFORE the S2S call; the owner's internal route trusts the internal secret
// as usual. Write-path gate: owner outage fails loudly with a 502.
//
// DARK: the owners don't expose /internal/moderation/* yet — they grow those
// endpoints in the cutover PR — so until then this route always answers 502.
// Nothing routes here from the gateway either, so no user can hit it.
// ---------------------------------------------------------------------------

const actionSchema = z.object({
  action: z.enum(["takedown", "restore"]),
  reason: z.string().trim().max(500).optional().or(z.literal("")),
  // Optionally close the report in the same request (a takedown usually
  // resolves the report that prompted it).
  resolve: z.boolean().optional(),
});

// Audit action slugs match the owner-native kebab convention
// (e.g. "takedown-message" next to provider-service's "restore-message").
const AUDIT_SLUG_BY_TARGET_TYPE: Partial<Record<TargetType, string>> = {
  PROVIDER: "provider",
  WORK_PHOTO: "photo",
  MESSAGE: "message",
  REVIEW: "review",
  JOB: "job",
};

admin.post("/api/admin/reports/:id/action", async (c) => {
  if (!isFullAdmin(c)) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = actionSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid input" }, 400);
  }
  const reason = parsed.data.reason || null;

  const id = c.req.param("id");
  const report = await db.report.findUnique({ where: { id } });
  if (!report) {
    return c.json({ error: "Report not found" }, 404);
  }

  const targetType = report.targetType as TargetType;
  const segment = ACTION_SEGMENT_BY_TARGET_TYPE[targetType];
  if (!segment) {
    // INQUIRY (a flag on a whole thread) and JOB_RESPONSE have no takedown
    // mutation — resolve/dismiss the report instead.
    return c.json({ error: "No moderation action for this target type" }, 400);
  }

  const owner: OwnerService = OWNER_BY_TARGET_TYPE[targetType];
  let res: Response;
  try {
    res = await s2s(
      ownerServiceUrl(owner),
      `/internal/moderation/${segment}/${encodeURIComponent(report.targetId)}/${parsed.data.action}`,
      { method: "POST", body: JSON.stringify({ reason }) }
    );
  } catch (e) {
    log.error("moderation action failed", { owner, targetType, err: e });
    return c.json({ error: "Moderation action failed" }, 502);
  }
  if (res.status === 404) {
    // The content row is gone (hard-deleted) — nothing to take down.
    return c.json({ error: "Target not found" }, 404);
  }
  if (!res.ok) {
    log.error("moderation action rejected", { owner, targetType, status: res.status });
    return c.json({ error: "Moderation action failed" }, 502);
  }

  await logAudit(
    c,
    `${parsed.data.action}-${AUDIT_SLUG_BY_TARGET_TYPE[targetType]}`,
    report.targetType,
    report.targetId,
    reason
  );

  if (parsed.data.resolve && report.status === "OPEN") {
    await db.report.update({
      where: { id },
      data: {
        status: "RESOLVED",
        resolvedBy: getAuth(c)?.userId ?? null,
        resolvedAt: new Date(),
      },
    });
    await logAudit(c, "resolve-report", "REPORT", id);
  }

  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Audit log (#227): the unified read-only moderation history. Same
// adminId/action/from/to filters and 200-row cap as the three per-service
// logs it replaces; rows carry the `service` origin column instead of the
// admin frontend's client-side source tag.
// ---------------------------------------------------------------------------

const AUDIT_LOG_TAKE = 200;

admin.get("/api/admin/audit-log", async (c) => {
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
