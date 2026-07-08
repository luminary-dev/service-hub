// Admin moderation endpoints (#226). Reads and report resolve/dismiss are
// open to the SUPPORT tier (isSupportOrAdmin); destructive writes require
// full ADMIN (isFullAdmin). Roles are forwarded by the gateway after JWT
// verification; unauthorized requests get 403 { error: "Forbidden" }.
import { Hono } from "hono";
import { z } from "zod";
import type { Context } from "hono";
import { db } from "../db";
import { getAuth, isFullAdmin, isSupportOrAdmin } from "../lib/http";
import { fetchProviderReviews, fetchRatings } from "../lib/clients";
import { computeQualityScore } from "../lib/quality-score";
import {
  buildAdminProvidersWhere,
  normalizeAdminListQuery,
} from "../lib/admin-list";

export const adminRoutes = new Hono();

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
    // them means hydrating and sorting the full match set in memory rather
    // than paginating in the database (same tradeoff the public directory
    // makes for its rating-based sorts — see providers.ts).
    const all = await db.provider.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { photos: true } } },
    });
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
  const [{ reviews }, ratings, openReportCount] = await Promise.all([
    fetchProviderReviews(id, { includeDeleted: true }),
    fetchRatings([id]),
    db.report.count({
      where: { targetType: "PROVIDER", targetId: id, status: "OPEN" },
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
adminRoutes.get("/api/admin/verifications", async (c) => {
  if (!isSupportOrAdmin(c)) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const rows = await db.provider.findMany({
    where: { verificationStatus: "PENDING" },
    orderBy: { updatedAt: "asc" },
    include: { verificationDocs: true },
  });

  const providers = rows.map((p) => ({
    ...p,
    user: { name: p.contactName, email: p.contactEmail },
  }));

  return c.json({ providers });
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

  const { count } = await db.provider.updateMany({
    where: { id: { in: parsed.data.ids } },
    data: { suspended: parsed.data.suspended },
  });
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
  const { count } = await db.provider.updateMany({
    where: { id: { in: ids }, verificationStatus: "PENDING" },
    data: {
      verificationStatus: approved ? "VERIFIED" : "REJECTED",
      verifiedAt: approved ? new Date() : null,
      rejectionReason: approved ? null : reason || null,
    },
  });

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
  await db.workPhoto.updateMany({
    where: { id },
    data: { deletedAt: null },
  });
  await logAudit(c, "restore-photo", "WORK_PHOTO", id);
  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Abuse-report moderation queue (#50): reports on providers and work photos
// (review reports live at review-service under /api/admin/review-reports).
// ---------------------------------------------------------------------------

// The closed tail is bounded — the queue view is about what's OPEN; recently
// handled reports are kept for context, not as a full audit browser.
const CLOSED_REPORTS_TAKE = 100;

const REPORT_STATUSES = ["OPEN", "RESOLVED", "DISMISSED"] as const;
// This queue only ever holds PROVIDER/WORK_PHOTO reports — REVIEW reports
// live at review-service. A REVIEW filter is valid overall (the admin
// frontend offers it as one dropdown across both services) but never
// matches here, so it short-circuits to an empty list below.
const LOCAL_TARGET_TYPES = ["PROVIDER", "WORK_PHOTO"] as const;

// OPEN reports first (newest first), then recently closed ones. Every report
// carries a hydrated target summary from local tables — provider name for
// PROVIDER targets, photo url + owner for WORK_PHOTO targets — and `target`
// is null when the target has since been hard-deleted.
//
// Filtering (#223): optional `status` and `targetType` query params, passed
// straight through from the admin frontend's filter dropdowns. Unrecognized
// values are ignored (treated as "all").
adminRoutes.get("/api/admin/reports", async (c) => {
  if (!isSupportOrAdmin(c)) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const statusParam = c.req.query("status");
  const status = REPORT_STATUSES.find((s) => s === statusParam);
  const targetTypeParam = c.req.query("targetType");
  if (targetTypeParam && !LOCAL_TARGET_TYPES.includes(targetTypeParam as never)) {
    // A REVIEW (or otherwise unknown) filter never matches provider-service
    // reports.
    return c.json({ reports: [] });
  }
  const targetType = targetTypeParam as (typeof LOCAL_TARGET_TYPES)[number] | undefined;

  const rows = status
    ? await db.report.findMany({
        where: { status, ...(targetType ? { targetType } : {}) },
        orderBy: { createdAt: "desc" },
        ...(status === "OPEN" ? {} : { take: CLOSED_REPORTS_TAKE }),
      })
    : await Promise.all([
        db.report.findMany({
          where: { status: "OPEN", ...(targetType ? { targetType } : {}) },
          orderBy: { createdAt: "desc" },
        }),
        db.report.findMany({
          where: { status: { not: "OPEN" }, ...(targetType ? { targetType } : {}) },
          orderBy: { createdAt: "desc" },
          take: CLOSED_REPORTS_TAKE,
        }),
      ]).then(([open, closed]) => [...open, ...closed]);

  const providerIds = rows
    .filter((r) => r.targetType === "PROVIDER")
    .map((r) => r.targetId);
  const photoIds = rows
    .filter((r) => r.targetType === "WORK_PHOTO")
    .map((r) => r.targetId);
  const [providers, photos] = await Promise.all([
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
  ]);
  const providerById = new Map(providers.map((p) => [p.id, p]));
  const photoById = new Map(photos.map((p) => [p.id, p]));

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

  return c.json({ reports });
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
  const { count } = await db.report.updateMany({
    where: { id: { in: parsed.data.ids } },
    data: {
      status: parsed.data.status,
      resolvedBy: getAuth(c)?.userId ?? null,
      resolvedAt: new Date(),
    },
  });
  return c.json({ ok: true, count });
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

const categoryCreateSchema = z.object({
  slug: categorySlug,
  labelEn: z.string().trim().min(1, "English label is required").max(80),
  labelSi: z.string().trim().min(1, "Sinhala label is required").max(80),
  icon: z.string().trim().max(60).optional().or(z.literal("")).nullish(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(100_000).optional(),
});

const categoryUpdateSchema = z
  .object({
    labelEn: z.string().trim().min(1, "English label is required").max(80),
    labelSi: z.string().trim().min(1, "Sinhala label is required").max(80),
    icon: z.string().trim().max(60).or(z.literal("")).nullable(),
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
      active: parsed.data.active ?? true,
      sortOrder: parsed.data.sortOrder ?? 0,
    },
  });
  await logAudit(c, "create-category", "CATEGORY", category.slug);
  return c.json({ category });
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
