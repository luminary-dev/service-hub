// Admin moderation endpoints. All require x-user-role=ADMIN (forwarded by the
// gateway after JWT verification), otherwise 403 { error: "Forbidden" }.
import { Hono } from "hono";
import { z } from "zod";
import type { Context } from "hono";
import { db } from "../db";
import { getAuth } from "../lib/http";
import { fetchProviderReviews, fetchRatings } from "../lib/clients";
import { computeQualityScore } from "../lib/quality-score";

export const adminRoutes = new Hono();

function isAdmin(c: Context): boolean {
  return getAuth(c)?.role === "ADMIN";
}

// Moderation list: every provider (suspended included), newest first, with
// contact info, local photo counts and review counts from review-service
// (degrades to 0).
adminRoutes.get("/api/admin/providers", async (c) => {
  if (!isAdmin(c)) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const rows = await db.provider.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { photos: true } } },
  });
  const providerIds = rows.map((p) => p.id);
  const [ratings, openReportRows] = await Promise.all([
    fetchRatings(providerIds),
    providerIds.length
      ? db.report.groupBy({
          by: ["targetId"],
          where: {
            targetType: "PROVIDER",
            targetId: { in: providerIds },
            status: "OPEN",
          },
          _count: { _all: true },
        })
      : [],
  ]);
  const openReportCounts: Record<string, number> = {};
  for (const r of openReportRows) openReportCounts[r.targetId] = r._count._all;

  const providers = rows.map(({ _count, ...p }) => {
    const rating = ratings[p.id]?.rating ?? 0;
    const reviewCount = ratings[p.id]?.count ?? 0;
    const openReportCount = openReportCounts[p.id] ?? 0;
    return {
      ...p,
      user: { name: p.contactName, email: p.contactEmail },
      _count: {
        reviews: reviewCount,
        photos: _count.photos,
      },
      // Quality signal (#229): see lib/quality-score.ts for the formula.
      quality: {
        ...computeQualityScore({ rating, reviewCount, openReportCount }),
        rating,
        reviewCount,
        openReportCount,
      },
    };
  });

  return c.json({ providers });
});

// Moderation detail: provider + contact + photos + reviews hydrated from
// review-service with reviewer names (degrades to []).
adminRoutes.get("/api/admin/providers/:id", async (c) => {
  if (!isAdmin(c)) {
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
  if (!isAdmin(c)) {
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
  if (!isAdmin(c)) {
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
  return c.json({ ok: true });
});

// `reason` is only meaningful on reject — an admin note that gets stored on
// the provider so they know what to fix on resubmission. Optional: existing
// callers that don't send it keep working unchanged.
const verificationActionSchema = z.object({
  action: z.enum(["approve", "reject"]),
  reason: z.string().trim().max(1000).optional(),
});

adminRoutes.patch("/api/admin/verifications/:id", async (c) => {
  if (!isAdmin(c)) {
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
  if (!isAdmin(c)) {
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
  if (!isAdmin(c)) {
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

  return c.json({ ok: true });
});

adminRoutes.patch("/api/admin/photos/:id/restore", async (c) => {
  if (!isAdmin(c)) {
    return c.json({ error: "Forbidden" }, 403);
  }
  await db.workPhoto.updateMany({
    where: { id: c.req.param("id") },
    data: { deletedAt: null },
  });
  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Abuse-report moderation queue (#50): reports on providers and work photos
// (review reports live at review-service under /api/admin/review-reports).
// ---------------------------------------------------------------------------

// The closed tail is bounded — the queue view is about what's OPEN; recently
// handled reports are kept for context, not as a full audit browser.
const CLOSED_REPORTS_TAKE = 100;

// OPEN reports first (newest first), then recently closed ones. Every report
// carries a hydrated target summary from local tables — provider name for
// PROVIDER targets, photo url + owner for WORK_PHOTO targets — and `target`
// is null when the target has since been hard-deleted.
adminRoutes.get("/api/admin/reports", async (c) => {
  if (!isAdmin(c)) {
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
  if (!isAdmin(c)) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = reportStatusSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid input" }, 400);
  }

  const { count } = await db.report.updateMany({
    where: { id: c.req.param("id") },
    data: { status: parsed.data.status },
  });
  if (count === 0) {
    return c.json({ error: "Report not found" }, 404);
  }
  return c.json({ ok: true });
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
  if (!isAdmin(c)) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const [pendingVerifications, openReports] = await Promise.all([
    db.provider.count({ where: { verificationStatus: "PENDING" } }),
    db.report.count({ where: { status: "OPEN" } }),
  ]);

  return c.json({ pendingVerifications, openReports });
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
  if (!isAdmin(c)) {
    return c.json({ error: "Forbidden" }, 403);
  }
  const categories = await db.category.findMany({
    orderBy: [{ sortOrder: "asc" }, { labelEn: "asc" }],
  });
  return c.json({ categories });
});

adminRoutes.post("/api/admin/categories", async (c) => {
  if (!isAdmin(c)) {
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
  return c.json({ category });
});

adminRoutes.patch("/api/admin/categories/:slug", async (c) => {
  if (!isAdmin(c)) {
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
  return c.json({ category: updated });
});
