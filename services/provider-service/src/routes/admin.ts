// Admin moderation endpoints (#226). Reads and report resolve/dismiss are
// open to the SUPPORT tier (isSupportOrAdmin); destructive writes require
// full ADMIN (isFullAdmin). Roles are forwarded by the gateway after JWT
// verification; unauthorized requests get 403 { error: "Forbidden" }.
import { Hono } from "hono";
import { z } from "zod";
import type { Context } from "hono";
import { db } from "../db";
import { getAuth, isFullAdmin, isSupportOrAdmin } from "../lib/http";
import {
  ALLOWED_IMAGE_TYPES,
  InvalidImageError,
  MAX_UPLOAD_SIZE,
  storeImage,
} from "../lib/storage";
import { fetchProviderReviews, fetchRatings, fetchRatingsResult } from "../lib/clients";
import { computeQualityScore } from "../lib/quality-score";
import { log } from "../lib/log";
import {
  buildAdminProvidersWhere,
  normalizeAdminListQuery,
  normalizePagination,
  sliceOpenClosed,
} from "../lib/admin-list";

export const adminRoutes = new Hono();

// Upper bound on providers loaded for the in-memory mostReviews ranking
// (#372) — mirrors MAX_BROWSE_CANDIDATES on the public directory. If ever
// hit, we log and rank the newest slice.
const MOST_REVIEWS_CANDIDATES = 1000;

// Moderation audit trail (#227): fire-and-record after every write below.
// Best-effort — a logging failure must never roll back or block the
// moderation action itself, so errors are swallowed.
async function logAudit(
  c: Context,
  action: string,
  targetType: string,
  targetId: string,
  reason?: string | null
): Promise<void> {
  const adminId = getAuth(c)?.userId;
  if (!adminId) return;
  try {
    await db.adminAuditLog.create({
      data: { adminId, action, targetType, targetId, reason: reason || null },
    });
  } catch {
    // best-effort
  }
}

// Moderation list (#224): search by name/contact, filter by category, city,
// verification status and suspended state, sort by newest or most reviews,
// paginated. Every row carries contact info, local photo counts and review
// counts hydrated from review-service (degrades to 0).
adminRoutes.get("/api/admin/providers", async (c) => {
  if (!isSupportOrAdmin(c)) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const query = c.req.query();
  const { page, pageSize, sort, q, category, city, status, suspended } =
    normalizeAdminListQuery({
      q: query.q ?? null,
      category: query.category ?? null,
      city: query.city ?? null,
      status: query.status ?? null,
      suspended: query.suspended ?? null,
      sort: query.sort ?? null,
      page: query.page ?? null,
      pageSize: query.pageSize ?? null,
    });

  const where = buildAdminProvidersWhere({ q, category, city, status, suspended });

  let total: number;
  let providers: unknown[];

  if (sort === "mostReviews") {
    // Review counts are derived data owned by review-service, so ranking by
    // them means hydrating and sorting the match set in memory rather than
    // paginating in the database (same tradeoff the public directory makes
    // for its rating-based sorts — see providers.ts). Bounded (#372): at most
    // MOST_REVIEWS_CANDIDATES rows (newest first) are loaded and ranked.
    const all = await db.provider.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: MOST_REVIEWS_CANDIDATES + 1,
      include: { _count: { select: { photos: true } } },
    });
    if (all.length > MOST_REVIEWS_CANDIDATES) {
      all.length = MOST_REVIEWS_CANDIDATES;
      log.warn("admin mostReviews sort hit candidate cap — ranking may be incomplete", {
        cap: MOST_REVIEWS_CANDIDATES,
      });
    }
    const ratings = await fetchRatings(all.map((p) => p.id));
    const ranked = [...all].sort(
      (a, b) =>
        (ratings[b.id]?.count ?? 0) - (ratings[a.id]?.count ?? 0) ||
        b.createdAt.getTime() - a.createdAt.getTime()
    );
    total = ranked.length;
    providers = ranked
      .slice((page - 1) * pageSize, page * pageSize)
      .map(({ _count, ...p }) => ({
        ...p,
        user: { name: p.contactName, email: p.contactEmail },
        _count: { reviews: ratings[p.id]?.count ?? 0, photos: _count.photos },
      }));
  } else {
    const [count, rows] = await Promise.all([
      db.provider.count({ where }),
      db.provider.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { _count: { select: { photos: true } } },
      }),
    ]);
    const ratings = await fetchRatings(rows.map((p) => p.id));
    total = count;
    providers = rows.map(({ _count, ...p }) => ({
      ...p,
      user: { name: p.contactName, email: p.contactEmail },
      _count: { reviews: ratings[p.id]?.count ?? 0, photos: _count.photos },
    }));
  }

  return c.json({ providers, total, page, pageSize });
});

// Moderation detail: provider + contact + photos + reviews hydrated from
// review-service with reviewer names (degrades to []).
adminRoutes.get("/api/admin/providers/:id", async (c) => {
  if (!isSupportOrAdmin(c)) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const id = c.req.param("id");
  const provider = await db.provider.findUnique({
    where: { id },
    include: { photos: { orderBy: { createdAt: "desc" } } },
  });
  if (!provider) {
    return c.json({ error: "Provider not found" }, 404);
  }

  // Moderation view: include soft-deleted reviews so admins can restore.
  // Only OPEN USER-source reports feed the quality-score penalty, matching the
  // auto-flagging run (POST /api/admin/flagging/run). SYSTEM reports are the
  // flagging job's own output, so counting them here would let an auto-flag
  // drive the score down further than the threshold that triggered it,
  // diverging the admin-visible score from the flagging decision.
  const [{ reviews }, ratings, openReportCount] = await Promise.all([
    fetchProviderReviews(id, { includeDeleted: true }),
    fetchRatings([id]),
    db.report.count({
      where: {
        targetType: "PROVIDER",
        targetId: id,
        status: "OPEN",
        source: "USER",
      },
    }),
  ]);
  const rating = ratings[id]?.rating ?? 0;
  const reviewCount = ratings[id]?.count ?? 0;
  return c.json({
    provider: {
      ...provider,
      user: { name: provider.contactName, email: provider.contactEmail },
      reviews,
      // Quality signal (#229): see lib/quality-score.ts for the formula.
      quality: {
        ...computeQualityScore({ rating, reviewCount, openReportCount }),
        rating,
        reviewCount,
        openReportCount,
      },
    },
  });
});

// Pending verification queue, oldest submission first, with documents.
// Paginated (#255): the queue grows unbounded otherwise, so `take`/`skip` are
// derived from a normalized page/pageSize and the total is returned alongside.
adminRoutes.get("/api/admin/verifications", async (c) => {
  if (!isSupportOrAdmin(c)) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const { page, pageSize } = normalizePagination({
    page: c.req.query("page") ?? null,
    pageSize: c.req.query("pageSize") ?? null,
  });

  const where = { verificationStatus: "PENDING" };
  const [total, rows] = await Promise.all([
    db.provider.count({ where }),
    db.provider.findMany({
      where,
      orderBy: { updatedAt: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { verificationDocs: true },
    }),
  ]);

  const providers = rows.map((p) => ({
    ...p,
    user: { name: p.contactName, email: p.contactEmail },
  }));

  return c.json({ providers, total, page, pageSize });
});

const actionSchema = z.object({
  action: z.enum(["verify", "unverify", "suspend", "unsuspend"]),
});

adminRoutes.patch("/api/admin/providers/:id", async (c) => {
  if (!isFullAdmin(c)) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const id = c.req.param("id");
  const provider = await db.provider.findUnique({ where: { id } });
  if (!provider) {
    return c.json({ error: "Provider not found" }, 404);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = actionSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid action" }, 400);
  }

  const data: Record<string, unknown> = {};
  switch (parsed.data.action) {
    case "verify":
      data.verificationStatus = "VERIFIED";
      data.verifiedAt = new Date();
      break;
    case "unverify":
      data.verificationStatus = "NONE";
      data.verifiedAt = null;
      break;
    case "suspend":
      data.suspended = true;
      break;
    case "unsuspend":
      data.suspended = false;
      break;
  }

  await db.provider.update({ where: { id }, data });
  await logAudit(c, parsed.data.action, "PROVIDER", id);
  return c.json({ ok: true });
});

const batchSuspendSchema = z.object({
  ids: z.array(z.string()).min(1).max(200),
  suspended: z.boolean(),
});

// Bulk suspend/unsuspend (#231): batch variant of the single-provider PATCH
// above, for the providers list's multi-select toolbar. Unknown/already-set
// ids are silently skipped by `updateMany` — the response `count` tells the
// caller how many rows actually changed.
adminRoutes.patch("/api/admin/providers", async (c) => {
  if (!isFullAdmin(c)) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = batchSuspendSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid input" }, 400);
  }

  const where = { id: { in: parsed.data.ids } };
  // Capture the ids actually matched before the write so the audit trail
  // records real targets (not the raw request list, which may include ids
  // that no longer exist).
  const affected = await db.provider.findMany({ where, select: { id: true } });
  const { count } = await db.provider.updateMany({
    where,
    data: { suspended: parsed.data.suspended },
  });
  // Audit trail (#227): one entry per affected provider, mirroring the
  // single-provider PATCH above so bulk actions leave the same trail.
  const action = parsed.data.suspended ? "suspend" : "unsuspend";
  await Promise.all(affected.map((p) => logAudit(c, action, "PROVIDER", p.id)));
  return c.json({ ok: true, count });
});

const verificationActionSchema = z.object({
  action: z.enum(["approve", "reject"]),
  reason: z.string().trim().max(1000).optional(),
});

adminRoutes.patch("/api/admin/verifications/:id", async (c) => {
  if (!isFullAdmin(c)) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const id = c.req.param("id");
  const provider = await db.provider.findUnique({ where: { id } });
  if (!provider) {
    return c.json({ error: "Provider not found" }, 404);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = verificationActionSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid action" }, 400);
  }

  const approved = parsed.data.action === "approve";
  await db.provider.update({
    where: { id },
    data: {
      verificationStatus: approved ? "VERIFIED" : "REJECTED",
      verifiedAt: approved ? new Date() : null,
      rejectionReason: approved ? null : parsed.data.reason || null,
    },
  });
  await logAudit(c, approved ? "verify" : "reject-verification", "PROVIDER", id);

  return c.json({ status: approved ? "VERIFIED" : "REJECTED" });
});

// Bulk approve/reject across the pending queue (#225). Only rows still
// PENDING are touched — an id that's already been actioned (e.g. by another
// admin, or from a stale client selection) is silently skipped rather than
// re-flipping its status.
const verificationBulkSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(200),
  action: z.enum(["approve", "reject"]),
  reason: z.string().trim().max(1000).optional(),
});

adminRoutes.patch("/api/admin/verifications", async (c) => {
  if (!isFullAdmin(c)) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = verificationBulkSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid input" }, 400);
  }

  const { ids, action, reason } = parsed.data;
  const approved = action === "approve";
  const where = { id: { in: ids }, verificationStatus: "PENDING" };
  // Only the still-PENDING ids are transitioned (and reported in `count`), so
  // capture exactly those before the write to audit the real targets.
  const affected = await db.provider.findMany({ where, select: { id: true } });
  const { count } = await db.provider.updateMany({
    where,
    data: {
      verificationStatus: approved ? "VERIFIED" : "REJECTED",
      verifiedAt: approved ? new Date() : null,
      rejectionReason: approved ? null : reason || null,
    },
  });

  // Audit trail (#227): one entry per provider actually transitioned out of
  // PENDING, mirroring the single-verification PATCH above.
  const auditAction = approved ? "verify" : "reject-verification";
  await Promise.all(
    affected.map((p) => logAudit(c, auditAction, "PROVIDER", p.id))
  );

  return c.json({ status: approved ? "VERIFIED" : "REJECTED", count });
});

adminRoutes.delete("/api/admin/photos/:id", async (c) => {
  if (!isFullAdmin(c)) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const id = c.req.param("id");
  const photo = await db.workPhoto.findUnique({ where: { id } });
  if (!photo) {
    return c.json({ error: "Photo not found" }, 404);
  }

  // Moderation removal is a SOFT delete (#32): row and file survive so the
  // action is reversible below. Owner deletes and account erasure stay hard.
  await db.workPhoto.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
  await logAudit(c, "delete-photo", "WORK_PHOTO", id);

  return c.json({ ok: true });
});

adminRoutes.patch("/api/admin/photos/:id/restore", async (c) => {
  if (!isFullAdmin(c)) {
    return c.json({ error: "Forbidden" }, 403);
  }
  const id = c.req.param("id");
  // updateMany returns count 0 when the id doesn't exist; report that as a
  // 404 rather than a misleading 200, matching the report PATCH above and the
  // findUnique 404 on the photo delete/verification routes.
  const { count } = await db.workPhoto.updateMany({
    where: { id },
    data: { deletedAt: null },
  });
  if (count === 0) {
    return c.json({ error: "Photo not found" }, 404);
  }
  await logAudit(c, "restore-photo", "WORK_PHOTO", id);
  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Abuse-report moderation queue (#50): reports on providers and work photos
// (review reports live at review-service under /api/admin/review-reports).
// ---------------------------------------------------------------------------

const REPORT_STATUSES = ["OPEN", "RESOLVED", "DISMISSED"] as const;
// This queue only ever holds PROVIDER/WORK_PHOTO/INQUIRY reports — REVIEW
// reports live at review-service, JOB/JOB_RESPONSE at job-service. Filters
// for a type another service owns are valid overall (the admin frontend
// offers one dropdown across all sources) but never match here, so they
// short-circuit to an empty list below. INQUIRY reports (#375) are only ever
// SYSTEM-created by the write-time content filter — there is no public
// report-an-inquiry flow.
const LOCAL_TARGET_TYPES = ["PROVIDER", "WORK_PHOTO", "INQUIRY"] as const;

// OPEN reports first (newest first), then closed ones (newest first). Every
// report carries a hydrated target summary from local tables — provider name
// for PROVIDER targets, photo url + owner for WORK_PHOTO targets, thread
// context for INQUIRY targets — and `target` is null when the target has
// since been hard-deleted.
//
// Filtering (#223): optional `status` and `targetType` query params, passed
// straight through from the admin frontend's filter dropdowns. Unrecognized
// values are ignored (treated as "all").
//
// Pagination (#255): the OPEN group was previously unbounded (only the closed
// tail was capped), so the queue grew linearly. Now every response is a
// normalized page/pageSize window with `total`; the OPEN-first ordering is
// preserved by slicing the virtual "open ++ closed" list across the two
// group queries (see sliceOpenClosed).
adminRoutes.get("/api/admin/reports", async (c) => {
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
  if (targetTypeParam && !LOCAL_TARGET_TYPES.includes(targetTypeParam as never)) {
    // A REVIEW (or otherwise unknown) filter never matches provider-service
    // reports.
    return c.json({ reports: [], total: 0, page, pageSize });
  }
  const targetType = targetTypeParam as (typeof LOCAL_TARGET_TYPES)[number] | undefined;
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

  const providerIds = rows
    .filter((r) => r.targetType === "PROVIDER")
    .map((r) => r.targetId);
  const photoIds = rows
    .filter((r) => r.targetType === "WORK_PHOTO")
    .map((r) => r.targetId);
  const inquiryIds = rows
    .filter((r) => r.targetType === "INQUIRY")
    .map((r) => r.targetId);
  const [providers, photos, inquiries] = await Promise.all([
    providerIds.length
      ? db.provider.findMany({
          where: { id: { in: providerIds } },
          select: { id: true, contactName: true, suspended: true },
        })
      : [],
    photoIds.length
      ? db.workPhoto.findMany({
          where: { id: { in: photoIds } },
          select: {
            id: true,
            url: true,
            caption: true,
            deletedAt: true,
            providerId: true,
            provider: { select: { contactName: true } },
          },
        })
      : [],
    inquiryIds.length
      ? db.inquiry.findMany({
          where: { id: { in: inquiryIds } },
          select: {
            id: true,
            name: true,
            message: true,
            providerId: true,
            provider: { select: { contactName: true } },
          },
        })
      : [],
  ]);
  const providerById = new Map(providers.map((p) => [p.id, p]));
  const photoById = new Map(photos.map((p) => [p.id, p]));
  const inquiryById = new Map(inquiries.map((i) => [i.id, i]));

  const reports = rows.map((r) => {
    let target = null;
    if (r.targetType === "PROVIDER") {
      const p = providerById.get(r.targetId);
      if (p) {
        target = {
          providerId: p.id,
          providerName: p.contactName,
          suspended: p.suspended,
        };
      }
    } else if (r.targetType === "INQUIRY") {
      // Thread context for a content-filter flag (#375): the customer name,
      // the original inquiry message and the provider whose thread it is. The
      // flagged text itself is in the report's `details` (a thread can hold
      // many messages; details pins the offending one).
      const i = inquiryById.get(r.targetId);
      if (i) {
        target = {
          providerId: i.providerId,
          providerName: i.provider.contactName,
          customerName: i.name,
          message: i.message,
        };
      }
    } else {
      const ph = photoById.get(r.targetId);
      if (ph) {
        target = {
          providerId: ph.providerId,
          providerName: ph.provider.contactName,
          photoUrl: ph.url,
          caption: ph.caption,
          removed: ph.deletedAt !== null,
        };
      }
    }
    return { ...r, target };
  });

  return c.json({ reports, total, page, pageSize });
});

const reportStatusSchema = z.object({ status: z.enum(["RESOLVED", "DISMISSED"]) });

adminRoutes.patch("/api/admin/reports/:id", async (c) => {
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
      resolvedBy: getAuth(c)?.userId ?? null,
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
// above, for the reports list's multi-select toolbar.
adminRoutes.patch("/api/admin/reports", async (c) => {
  if (!isSupportOrAdmin(c)) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = batchReportStatusSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid input" }, 400);
  }

  // Audit trail (#223): stamp who closed the reports and when, matching the
  // single-report PATCH above so bulk-closed reports carry the same metadata.
  const where = { id: { in: parsed.data.ids } };
  // Capture the ids actually matched before the write so the audit log records
  // real targets (unknown ids in the request list are skipped).
  const affected = await db.report.findMany({ where, select: { id: true } });
  const { count } = await db.report.updateMany({
    where,
    data: {
      status: parsed.data.status,
      resolvedBy: getAuth(c)?.userId ?? null,
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
// Auto-flagging (#232): sweep every active provider and open a SYSTEM report
// for any that crosses a quality/report-volume threshold, so risky providers
// surface in the moderation queue without a human scanning the whole roster.
// It creates records, so it's a full-ADMIN action. Admin-triggered (there is
// no cron/worker infra yet) from the reports page; a real scheduler can hit
// the same route later.
//
// A provider is flagged when its quality score (#229) drops below
// FLAG_QUALITY_BELOW, or it has FLAG_OPEN_USER_REPORTS_AT+ open USER-source
// reports. Dedupe: providers that already carry an OPEN SYSTEM report are
// skipped so repeated runs don't pile up duplicate flags.
// ---------------------------------------------------------------------------
const FLAG_QUALITY_BELOW = 40;
const FLAG_OPEN_USER_REPORTS_AT = 3;

adminRoutes.post("/api/admin/flagging/run", async (c) => {
  if (!isFullAdmin(c)) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const providers = await db.provider.findMany({
    where: { suspended: false },
    select: { id: true },
  });
  if (providers.length === 0) {
    return c.json({ flagged: 0 });
  }

  const providerIds = providers.map((p) => p.id);

  // Open USER-report counts per provider, providers already carrying an OPEN
  // SYSTEM flag (dedupe set), and rating/reviewCount — all as grouped/batched
  // queries rather than one-per-provider.
  const [userReportGroups, systemFlagGroups, ratingsResult] = await Promise.all([
    db.report.groupBy({
      by: ["targetId"],
      where: {
        targetType: "PROVIDER",
        targetId: { in: providerIds },
        status: "OPEN",
        source: "USER",
      },
      _count: { _all: true },
    }),
    db.report.groupBy({
      by: ["targetId"],
      where: {
        targetType: "PROVIDER",
        targetId: { in: providerIds },
        status: "OPEN",
        source: "SYSTEM",
      },
      _count: { _all: true },
    }),
    fetchRatingsResult(providerIds),
  ]);

  const openUserReportsById = new Map(
    userReportGroups.map((g) => [g.targetId, g._count._all])
  );
  const alreadyFlagged = new Set(systemFlagGroups.map((g) => g.targetId));

  // The quality-score signal is only trustworthy when ratings hydrated fully.
  // On a review-service outage `fetchRatings` degrades to "no reviews" for every
  // provider, which is indistinguishable from a genuine zero-review provider —
  // acting on it would flag healthy providers with bogus SYSTEM reports (#366).
  // So when the ratings fetch was incomplete, drop the quality trigger for this
  // run and flag on report volume alone (which needs no peer).
  const { ok: ratingsOk, ratings } = ratingsResult;

  const toFlag = providers.filter((p) => {
    if (alreadyFlagged.has(p.id)) return false;
    const openUserReportCount = openUserReportsById.get(p.id) ?? 0;
    if (openUserReportCount >= FLAG_OPEN_USER_REPORTS_AT) return true;
    if (!ratingsOk) return false;
    const { qualityScore } = computeQualityScore({
      rating: ratings[p.id]?.rating ?? 0,
      reviewCount: ratings[p.id]?.count ?? 0,
      openReportCount: openUserReportCount,
    });
    return qualityScore < FLAG_QUALITY_BELOW;
  });

  if (toFlag.length === 0) {
    return c.json({ flagged: 0 });
  }

  await db.report.createMany({
    data: toFlag.map((p) => ({
      targetType: "PROVIDER",
      targetId: p.id,
      reporterId: null,
      reason: "auto-flag: low quality score / high report volume",
      status: "OPEN",
      source: "SYSTEM",
    })),
  });

  await logAudit(c, "run-flagging", "PROVIDER", "batch", `flagged ${toFlag.length}`);

  return c.json({ flagged: toFlag.length });
});

// ---------------------------------------------------------------------------
// Admin hub notification badges (#233): lightweight aggregate counts for the
// nav cards on /admin — pending verifications and open reports. This is
// provider-service's slice only; review-service owns reports filed against
// reviews (GET /api/admin/review-reports/count) and the frontend sums the
// two client-side, mirroring the two-service merge already done on the
// reports page. Cheap counts on indexed columns, safe to poll on page
// load/focus.
// ---------------------------------------------------------------------------
adminRoutes.get("/api/admin/notifications/counts", async (c) => {
  if (!isSupportOrAdmin(c)) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const [pendingVerifications, openReports] = await Promise.all([
    db.provider.count({ where: { verificationStatus: "PENDING" } }),
    db.report.count({ where: { status: "OPEN" } }),
  ]);

  return c.json({ pendingVerifications, openReports });
});

// ---------------------------------------------------------------------------
// Dashboard analytics (#219): aggregate counts for the /admin home page.
// Open reports here is only the provider-service half of the metric — the
// review-service half (reports on reviews) is served separately at
// review-service's /api/admin/review-stats and summed on the frontend.
// ---------------------------------------------------------------------------

adminRoutes.get("/api/admin/stats", async (c) => {
  if (!isSupportOrAdmin(c)) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const [active, suspended, pendingVerifications, openReports, categoryGroups, categories] =
    await Promise.all([
      db.provider.count({ where: { suspended: false } }),
      db.provider.count({ where: { suspended: true } }),
      db.provider.count({ where: { verificationStatus: "PENDING" } }),
      db.report.count({ where: { status: "OPEN" } }),
      db.provider.groupBy({ by: ["category"], _count: { _all: true } }),
      db.category.findMany({ select: { slug: true, labelEn: true, labelSi: true } }),
    ]);

  const labelBySlug = new Map(categories.map((cat) => [cat.slug, cat]));
  const categoryDistribution = categoryGroups
    .map((g) => {
      const cat = labelBySlug.get(g.category);
      return {
        slug: g.category,
        labelEn: cat?.labelEn ?? g.category,
        labelSi: cat?.labelSi ?? g.category,
        count: g._count._all,
      };
    })
    .sort((a, b) => b.count - a.count);

  return c.json({
    providers: { active, suspended, total: active + suspended },
    pendingVerifications,
    openReports,
    categoryDistribution,
  });
});

// ---------------------------------------------------------------------------
// Category management (#135/#60). No hard delete: deactivating hides a
// category from the public list while existing providers keep the slug.
// ---------------------------------------------------------------------------

const categorySlug = z
  .string()
  .regex(/^[a-z0-9-]{2,40}$/, "Slug must be 2-40 lowercase letters, digits or dashes");

// A stored image path — a relative /path under one of our own media roots, so
// a category can only point at an uploaded cover (/api/files/category/… — see
// storeImage → media-service) or a seeded /images/… asset, never an external
// URL. The prefix is pinned because a bare `/^\/…/` also matches a
// protocol-relative `//evil.com/x.jpg` (leading `//` → `//host`), which the
// browser resolves against the current scheme and loads cross-origin (#519).
const imagePath = z
  .string()
  .trim()
  .max(300)
  .regex(/^\/(?:api\/files|images)\/[\w./-]+$/, "Image URL must be a relative path");

const categoryCreateSchema = z.object({
  slug: categorySlug,
  labelEn: z.string().trim().min(1, "English label is required").max(80),
  labelSi: z.string().trim().min(1, "Sinhala label is required").max(80),
  icon: z.string().trim().max(60).optional().or(z.literal("")).nullish(),
  imageUrl: imagePath.optional().or(z.literal("")).nullish(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(100_000).optional(),
});

const categoryUpdateSchema = z
  .object({
    labelEn: z.string().trim().min(1, "English label is required").max(80),
    labelSi: z.string().trim().min(1, "Sinhala label is required").max(80),
    icon: z.string().trim().max(60).or(z.literal("")).nullable(),
    imageUrl: imagePath.or(z.literal("")).nullable(),
    active: z.boolean(),
    sortOrder: z.number().int().min(0).max(100_000),
  })
  .partial();

// Management list: every category, inactive included.
adminRoutes.get("/api/admin/categories", async (c) => {
  if (!isSupportOrAdmin(c)) {
    return c.json({ error: "Forbidden" }, 403);
  }
  const categories = await db.category.findMany({
    orderBy: [{ sortOrder: "asc" }, { labelEn: "asc" }],
  });
  return c.json({ categories });
});

adminRoutes.post("/api/admin/categories", async (c) => {
  if (!isFullAdmin(c)) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = categoryCreateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, 400);
  }

  const existing = await db.category.findUnique({
    where: { slug: parsed.data.slug },
  });
  if (existing) {
    return c.json({ error: "A category with this slug already exists" }, 409);
  }

  const category = await db.category.create({
    data: {
      slug: parsed.data.slug,
      labelEn: parsed.data.labelEn,
      labelSi: parsed.data.labelSi,
      icon: parsed.data.icon || null,
      imageUrl: parsed.data.imageUrl || null,
      active: parsed.data.active ?? true,
      sortOrder: parsed.data.sortOrder ?? 0,
    },
  });
  await logAudit(c, "create-category", "CATEGORY", category.slug);
  return c.json({ category });
});

// Cover-image upload for a category (#436). Full-admin only; stores through
// media-service under the "category" namespace (R2 in prod) and returns the
// relative URL for the caller to save via create/patch above.
adminRoutes.post("/api/admin/categories/image", async (c) => {
  if (!isFullAdmin(c)) {
    return c.json({ error: "Forbidden" }, 403);
  }
  const form = await c.req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return c.json({ error: "No file provided" }, 400);
  }
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    return c.json({ error: "Only JPEG, PNG and WebP images are allowed" }, 400);
  }
  if (file.size > MAX_UPLOAD_SIZE) {
    return c.json({ error: "Image must be under 5MB" }, 400);
  }
  let url: string;
  try {
    url = await storeImage("category", file, "covers");
  } catch (e) {
    if (e instanceof InvalidImageError) return c.json({ error: e.message }, 400);
    throw e;
  }
  return c.json({ url });
});

adminRoutes.patch("/api/admin/categories/:slug", async (c) => {
  if (!isFullAdmin(c)) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const slug = c.req.param("slug");
  const category = await db.category.findUnique({ where: { slug } });
  if (!category) {
    return c.json({ error: "Category not found" }, 404);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = categoryUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, 400);
  }

  const data = parsed.data;
  const updated = await db.category.update({
    where: { slug },
    data: {
      ...(data.labelEn !== undefined ? { labelEn: data.labelEn } : {}),
      ...(data.labelSi !== undefined ? { labelSi: data.labelSi } : {}),
      ...(data.icon !== undefined ? { icon: data.icon || null } : {}),
      ...(data.imageUrl !== undefined ? { imageUrl: data.imageUrl || null } : {}),
      ...(data.active !== undefined ? { active: data.active } : {}),
      ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}),
    },
  });
  await logAudit(c, "edit-category", "CATEGORY", slug);
  return c.json({ category: updated });
});

// ---------------------------------------------------------------------------
// Audit log (#227): read-only history of every moderation write above.
// review-service keeps its own log for the actions it owns, exposed at
// GET /api/admin/review-audit-log — the admin frontend merges both.
// ---------------------------------------------------------------------------

const AUDIT_LOG_TAKE = 200;

adminRoutes.get("/api/admin/audit-log", async (c) => {
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
