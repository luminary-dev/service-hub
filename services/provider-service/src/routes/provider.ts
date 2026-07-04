// Provider dashboard endpoints. Every route requires a provider owned by the
// authenticated user with role PROVIDER (mirrors the monolith's
// getCurrentProvider), otherwise 401 { error: "Unauthorized" }.
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db";
import {
  districtEnum,
  optionalSlPhone,
  optionalWebUrl,
  priceRupees,
  slPhone,
} from "../lib/field-rules";
import { categoryValidator } from "../lib/categories";
import {
  fetchEmailVerified,
  fetchOpenJobsCount,
  fetchRatings,
  syncIdentityProfile,
} from "../lib/clients";
import { getCurrentProvider } from "../lib/provider-auth";
import {
  ALLOWED_IMAGE_TYPES,
  InvalidImageError,
  MAX_UPLOAD_SIZE,
  removeStoredFile,
  storeImage,
  validateImage,
} from "../lib/storage";

export const providerDashboardRoutes = new Hono();

// Everything the dashboard page needs in one payload: the provider with its
// contact info (emailVerified fresh from identity), services, photos,
// inquiries, a rating summary from review-service and the count of open jobs
// matching the provider's trade — all peer reads degrade gracefully.
providerDashboardRoutes.get("/api/provider/dashboard", async (c) => {
  const provider = await getCurrentProvider(c);
  if (!provider) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const [services, photos, inquiries, emailVerified, ratings, openJobsCount] =
    await Promise.all([
      db.service.findMany({ where: { providerId: provider.id }, orderBy: { price: "asc" } }),
      db.workPhoto.findMany({
        where: { providerId: provider.id, deletedAt: null },
        orderBy: { createdAt: "desc" },
      }),
      db.inquiry.findMany({
        where: { providerId: provider.id },
        orderBy: { createdAt: "desc" },
      }),
      fetchEmailVerified(provider.userId),
      fetchRatings([provider.id]),
      fetchOpenJobsCount(provider.category, provider.district, provider.userId),
    ]);

  const r = ratings[provider.id];
  return c.json({
    provider: {
      ...provider,
      user: {
        name: provider.contactName,
        email: provider.contactEmail,
        phone: provider.contactPhone,
        emailVerified,
      },
      services,
      photos,
      inquiries,
      ratingSummary: { rating: r?.rating ?? null, count: r?.count ?? 0 },
    },
    openJobsCount,
  });
});

// Away mode (#49): an optional return date. Absent leaves the stored value
// untouched; null (or "") clears it. Anything else must parse as a date and
// be at most one year out — past dates are accepted (they simply mean "not
// away", matching lib/availability.ts).
const awayUntilField = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v, ctx) => {
    if (v === undefined) return undefined;
    if (v === null || v.trim() === "") return null;
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) {
      ctx.addIssue({ code: "custom", message: "Invalid away-until date" });
      return z.NEVER;
    }
    const max = new Date();
    max.setFullYear(max.getFullYear() + 1);
    if (d > max) {
      ctx.addIssue({
        code: "custom",
        message: "Away-until date can be at most one year from now",
      });
      return z.NEVER;
    }
    return d;
  });

const profileSchema = z.object({
  name: z.string().min(2).max(80),
  phone: slPhone,
  // Category membership is checked against the Category table after parsing —
  // zod schemas are sync, and the list is now data, not code.
  category: z.string().min(1).max(40),
  headline: z.string().min(5).max(120),
  bio: z.string().min(20).max(2000),
  district: districtEnum,
  city: z.string().min(1).max(60),
  experience: z.number().int().min(0).max(60),
  available: z.boolean(),
  awayUntil: awayUntilField,
  whatsapp: optionalSlPhone,
  phone2: optionalSlPhone,
  facebook: optionalWebUrl,
  instagram: optionalWebUrl,
  tiktok: optionalWebUrl,
  youtube: optionalWebUrl,
  website: optionalWebUrl,
});

providerDashboardRoutes.put("/api/provider/profile", async (c) => {
  const provider = await getCurrentProvider(c);
  if (!provider) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = profileSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, 400);
  }
  if (!(await categoryValidator.isValidCategory(parsed.data.category))) {
    return c.json({ error: "Invalid category" }, 400);
  }
  const { name, phone, ...profile } = parsed.data;

  const updated = await db.provider.update({
    where: { id: provider.id },
    data: {
      ...profile,
      whatsapp: profile.whatsapp || null,
      phone2: profile.phone2 || null,
      facebook: profile.facebook || null,
      instagram: profile.instagram || null,
      tiktok: profile.tiktok || null,
      youtube: profile.youtube || null,
      website: profile.website || null,
      contactName: name,
      contactPhone: phone,
    },
  });

  // Keep identity's user row in sync (name/phone). Best-effort: our
  // denormalized copy is the write we own.
  await syncIdentityProfile(provider.userId, { name, phone });

  return c.json({ provider: updated });
});

const serviceSchema = z.object({
  title: z.string().min(2).max(100),
  description: z.string().max(500).optional().or(z.literal("")),
  price: priceRupees,
  priceType: z.enum(["HOURLY", "DAILY", "FIXED", "VISIT"]),
});

providerDashboardRoutes.post("/api/provider/services", async (c) => {
  const provider = await getCurrentProvider(c);
  if (!provider) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = serviceSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid input" }, 400);
  }

  const service = await db.service.create({
    data: {
      providerId: provider.id,
      title: parsed.data.title,
      description: parsed.data.description || null,
      price: parsed.data.price,
      priceType: parsed.data.priceType,
    },
  });

  return c.json({ service });
});

providerDashboardRoutes.put("/api/provider/services/:id", async (c) => {
  const provider = await getCurrentProvider(c);
  if (!provider) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const id = c.req.param("id");
  const service = await db.service.findUnique({ where: { id } });
  if (!service || service.providerId !== provider.id) {
    return c.json({ error: "Service not found" }, 404);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = serviceSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid input" }, 400);
  }

  const updated = await db.service.update({
    where: { id },
    data: {
      title: parsed.data.title,
      description: parsed.data.description || null,
      price: parsed.data.price,
      priceType: parsed.data.priceType,
    },
  });

  return c.json({ service: updated });
});

providerDashboardRoutes.delete("/api/provider/services/:id", async (c) => {
  const provider = await getCurrentProvider(c);
  if (!provider) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const id = c.req.param("id");
  const service = await db.service.findUnique({ where: { id } });
  if (!service || service.providerId !== provider.id) {
    return c.json({ error: "Service not found" }, 404);
  }

  await db.service.delete({ where: { id } });
  return c.json({ ok: true });
});

providerDashboardRoutes.post("/api/provider/photos", async (c) => {
  const provider = await getCurrentProvider(c);
  if (!provider) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const form = await c.req.formData().catch(() => null);
  const file = form?.get("file");
  const caption = form?.get("caption");
  const kind = form?.get("kind");

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
    url = await storeImage(file, "uploads");
  } catch (e) {
    if (e instanceof InvalidImageError) return c.json({ error: e.message }, 400);
    throw e;
  }

  if (kind === "avatar") {
    await db.provider.update({
      where: { id: provider.id },
      data: { avatarUrl: url },
    });
    return c.json({ avatarUrl: url });
  }

  const photo = await db.workPhoto.create({
    data: {
      providerId: provider.id,
      url,
      caption: typeof caption === "string" && caption ? caption : null,
    },
  });

  return c.json({ photo });
});

providerDashboardRoutes.delete("/api/provider/photos/:id", async (c) => {
  const provider = await getCurrentProvider(c);
  if (!provider) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const id = c.req.param("id");
  const photo = await db.workPhoto.findUnique({ where: { id } });
  if (!photo || photo.providerId !== provider.id) {
    return c.json({ error: "Photo not found" }, 404);
  }

  await db.workPhoto.delete({ where: { id } });
  await removeStoredFile(photo.url);

  return c.json({ ok: true });
});

providerDashboardRoutes.get("/api/provider/inquiries", async (c) => {
  const provider = await getCurrentProvider(c);
  if (!provider) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const inquiries = await db.inquiry.findMany({
    where: { providerId: provider.id },
    orderBy: { createdAt: "desc" },
  });

  return c.json({ inquiries });
});

const inquiryStatusSchema = z.object({
  status: z.enum(["NEW", "RESPONDED", "CLOSED"]),
});

providerDashboardRoutes.patch("/api/provider/inquiries/:id", async (c) => {
  const provider = await getCurrentProvider(c);
  if (!provider) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const id = c.req.param("id");
  const inquiry = await db.inquiry.findUnique({ where: { id } });
  if (!inquiry || inquiry.providerId !== provider.id) {
    return c.json({ error: "Inquiry not found" }, 404);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = inquiryStatusSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid input" }, 400);
  }

  const updated = await db.inquiry.update({
    where: { id },
    data: {
      status: parsed.data.status,
      // Stamp only the first move to RESPONDED — later status churn must not
      // rewrite the response time.
      ...(parsed.data.status === "RESPONDED" && !inquiry.respondedAt
        ? { respondedAt: new Date() }
        : {}),
    },
  });

  return c.json({ inquiry: updated });
});

// Provider submits verification documents (NIC and/or business registration).
// Sensitive PII — the stored URLs are only ever returned to admins.
providerDashboardRoutes.post("/api/provider/verification", async (c) => {
  const provider = await getCurrentProvider(c);
  if (!provider) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  if (provider.verificationStatus === "VERIFIED") {
    return c.json({ error: "Your profile is already verified." }, 400);
  }

  const form = await c.req.formData().catch(() => null);
  const nic = form?.get("nic");
  const business = form?.get("business");

  const uploads: { kind: string; file: File }[] = [];
  for (const [kind, value] of [
    ["NIC", nic],
    ["BUSINESS", business],
  ] as const) {
    if (value instanceof File && value.size > 0) {
      const error = validateImage(value);
      if (error) {
        return c.json({ error }, 400);
      }
      uploads.push({ kind, file: value });
    }
  }

  if (uploads.length === 0) {
    return c.json(
      { error: "Upload at least one document (NIC or business registration)." },
      400
    );
  }

  // Replace any previous submission's documents.
  await db.verificationDocument.deleteMany({
    where: { providerId: provider.id },
  });
  for (const { kind, file } of uploads) {
    let url: string;
    try {
      url = await storeImage(file, "verification");
    } catch (e) {
      if (e instanceof InvalidImageError) return c.json({ error: e.message }, 400);
      throw e;
    }
    await db.verificationDocument.create({
      data: { providerId: provider.id, kind, url },
    });
  }

  await db.provider.update({
    where: { id: provider.id },
    data: { verificationStatus: "PENDING", verifiedAt: null },
  });

  return c.json({ status: "PENDING" });
});
