// Admin moderation endpoints. All require x-user-role=ADMIN (forwarded by the
// gateway after JWT verification), otherwise 403 { error: "Forbidden" }.
import { Hono } from "hono";
import { z } from "zod";
import type { Context } from "hono";
import { db } from "../db";
import { getAuth } from "../lib/http";
import { fetchProviderReviews, fetchRatings } from "../lib/clients";
import { removeStoredFile } from "../lib/storage";

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
  const ratings = await fetchRatings(rows.map((p) => p.id));

  const providers = rows.map(({ _count, ...p }) => ({
    ...p,
    user: { name: p.contactName, email: p.contactEmail },
    _count: {
      reviews: ratings[p.id]?.count ?? 0,
      photos: _count.photos,
    },
  }));

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

  const reviews = await fetchProviderReviews(id);
  return c.json({
    provider: {
      ...provider,
      user: { name: provider.contactName, email: provider.contactEmail },
      reviews,
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

const verificationActionSchema = z.object({ action: z.enum(["approve", "reject"]) });

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
    },
  });

  return c.json({ status: approved ? "VERIFIED" : "REJECTED" });
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

  await db.workPhoto.delete({ where: { id } });
  await removeStoredFile(photo.url);

  return c.json({ ok: true });
});
