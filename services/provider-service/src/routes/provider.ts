// Provider dashboard endpoints. Every route requires a provider owned by the
// authenticated user with role PROVIDER (mirrors the monolith's
// getCurrentProvider), otherwise 401 { error: "Unauthorized" }.
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db";
import { moderateContent } from "../lib/auto-report";
import {
  districtEnum,
  GEO_PAIR_MESSAGE,
  geoPairState,
  latitudeField,
  longitudeField,
  MAX_SERVICE_DISTRICTS,
  normalizeServiceDistricts,
  optionalSlPhone,
  optionalWebUrl,
  priceRupees,
  serviceDistrictsField,
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
import { isSupportOrAdmin, s2s } from "../lib/http";
import { moneyToNumber } from "../lib/money";
import { normalizePagination } from "../lib/admin-list";
import { unreadCounts } from "./messages";
import {
  ALLOWED_IMAGE_TYPES,
  InvalidImageError,
  MAX_UPLOAD_SIZE,
  removeStoredFile,
  storeImage,
  validateImage,
} from "../lib/storage";

export const providerDashboardRoutes = new Hono();

const MEDIA_SERVICE_URL =
  process.env.MEDIA_SERVICE_URL ?? "http://localhost:4006";

// The dashboard embeds only the first page of inquiries (#372) — deeper pages
// come from the paginated GET /api/provider/inquiries. Counts ride along so
// the stats/badges track the full inbox, not just the embedded slice.
const DASHBOARD_INQUIRIES_TAKE = 20;

// Everything the dashboard page needs in one payload: the provider with its
// contact info (emailVerified fresh from identity), services, photos, the
// first page of inquiries (+ totals), a rating summary from review-service and
// the count of open jobs matching the provider's trade — all peer reads
// degrade gracefully.
providerDashboardRoutes.get("/api/provider/dashboard", async (c) => {
  const provider = await getCurrentProvider(c);
  if (!provider) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const [
    services,
    photos,
    inquiries,
    inquiriesTotal,
    newInquiriesCount,
    emailVerified,
    ratings,
    openJobsCount,
  ] = await Promise.all([
    db.service.findMany({ where: { providerId: provider.id }, orderBy: { price: "asc" } }),
    db.workPhoto.findMany({
      where: { providerId: provider.id, deletedAt: null },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    }),
    db.inquiry.findMany({
      where: { providerId: provider.id },
      orderBy: { createdAt: "desc" },
      take: DASHBOARD_INQUIRIES_TAKE,
    }),
    db.inquiry.count({ where: { providerId: provider.id } }),
    db.inquiry.count({ where: { providerId: provider.id, status: "NEW" } }),
    fetchEmailVerified(provider.userId),
    fetchRatings([provider.id]),
    fetchOpenJobsCount(
      provider.category,
      // Served set (#502); rows predating the backfill (tests, partial
      // fixtures) fall back to the primary district.
      provider.serviceDistricts?.length
        ? provider.serviceDistricts
        : [provider.district],
      provider.userId
    ),
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
      // price is DECIMAL in the DB (#371) — a Decimal JSON-serializes as a
      // string, so convert back to the number this payload has always carried.
      services: services.map((s) => ({ ...s, price: moneyToNumber(s.price) })),
      photos,
      inquiries,
      inquiriesTotal,
      newInquiriesCount,
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
  // Optional Sinhala variants (#515). No minimum (they're optional), same
  // maximums as the English originals; empty/absent clears to null.
  headlineSi: z.string().max(120).optional().or(z.literal("")).nullish(),
  bioSi: z.string().max(2000).optional().or(z.literal("")).nullish(),
  district: districtEnum,
  // Multi-district service area (#502): the districts the provider serves.
  // Optional so pre-#502 clients keep working; the primary district is always
  // (re)added by normalizeServiceDistricts below.
  serviceDistricts: serviceDistrictsField,
  city: z.string().min(1).max(60),
  // Optional map pin (#48, geo-capture phase of the search RFC). Bounds-checked
  // against the Sri Lanka box; the both-or-neither pair rule is enforced after
  // parsing (geoPairState below). Absent leaves the stored pin untouched;
  // explicit nulls clear it — the awayUntil contract.
  latitude: latitudeField,
  longitude: longitudeField,
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
  // Map pin (#48): the coordinates are a pair — a lone latitude (or a
  // number/null mix) must never persist. "unset" (both absent) leaves the
  // stored pin untouched via the undefined spread below; "clear" (both null)
  // clears it.
  if (geoPairState(parsed.data.latitude, parsed.data.longitude) === "invalid") {
    return c.json({ error: GEO_PAIR_MESSAGE }, 400);
  }
  const { name, phone, ...profile } = parsed.data;

  // Served set (#502): dedupe, pin the (possibly changed) primary district,
  // refuse a union over the cap rather than silently truncating.
  const serviceDistricts = normalizeServiceDistricts(
    profile.district,
    profile.serviceDistricts
  );
  if (!serviceDistricts) {
    return c.json(
      {
        error: `You can serve at most ${MAX_SERVICE_DISTRICTS} districts (including your own)`,
      },
      400
    );
  }

  const updated = await db.provider.update({
    where: { id: provider.id },
    data: {
      ...profile,
      serviceDistricts,
      headlineSi: profile.headlineSi || null,
      bioSi: profile.bioSi || null,
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

  // Content filter (#375): AFTER the write on purpose — the profile stays
  // visible and a filter hit only queues a SYSTEM report for admin triage.
  await moderateContent("PROVIDER", provider.id, {
    headline: profile.headline,
    bio: profile.bio,
    headlineSi: profile.headlineSi,
    bioSi: profile.bioSi,
  });

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

  // Content filter (#375): service text is profile content, so a hit flags
  // the provider (auto-report only — the write is never blocked).
  await moderateContent("PROVIDER", provider.id, {
    title: parsed.data.title,
    description: parsed.data.description,
  });

  // price comes back from Prisma as a Decimal (#371) — convert so the JSON
  // payload keeps carrying a number.
  return c.json({ service: { ...service, price: moneyToNumber(service.price) } });
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

  // Content filter (#375): same PROVIDER-target flag as the create path.
  await moderateContent("PROVIDER", provider.id, {
    title: parsed.data.title,
    description: parsed.data.description,
  });

  // Same Decimal → number edge conversion as the create path (#371).
  return c.json({ service: { ...updated, price: moneyToNumber(updated.price) } });
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
    url = await storeImage("provider", file, "uploads");
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

  // Dedicated cover photo (#435): stored under the same namespace/prefix, set
  // on the provider (not added to the work gallery).
  if (kind === "cover") {
    await db.provider.update({
      where: { id: provider.id },
      data: { coverPhoto: url },
    });
    return c.json({ coverPhoto: url });
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

// Remove the dedicated cover (#435); the card falls back to the first work
// photo / category image again.
providerDashboardRoutes.delete("/api/provider/cover", async (c) => {
  const provider = await getCurrentProvider(c);
  if (!provider) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  await db.provider.update({
    where: { id: provider.id },
    data: { coverPhoto: null },
  });
  return c.json({ ok: true });
});

// Reorder the caller's gallery: sortOrder = position of the photo's id in the
// submitted array. Ids that don't belong to the caller (or don't exist) are
// ignored, so a stale or hostile payload can never touch another provider's
// photos; own photos missing from the payload keep their old sortOrder.
const photoOrderSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(500),
});

providerDashboardRoutes.patch("/api/provider/photos/order", async (c) => {
  const provider = await getCurrentProvider(c);
  if (!provider) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = photoOrderSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid input" }, 400);
  }

  const owned = await db.workPhoto.findMany({
    where: { id: { in: parsed.data.ids }, providerId: provider.id },
    select: { id: true },
  });
  const ownedIds = new Set(owned.map((p) => p.id));

  await db.$transaction(
    parsed.data.ids
      .filter((id) => ownedIds.has(id))
      .map((id, index) =>
        db.workPhoto.update({ where: { id }, data: { sortOrder: index } })
      )
  );

  return c.json({ ok: true });
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

// Paginated (#372): the inbox grows unbounded otherwise. `page`/`pageSize`
// use the shared normalization (default 20, cap 100); the envelope adds
// `total`/`page`/`pageSize` alongside the existing `inquiries` key so older
// callers keep working. Unread counts are computed per page, not per inbox.
providerDashboardRoutes.get("/api/provider/inquiries", async (c) => {
  const provider = await getCurrentProvider(c);
  if (!provider) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const { page, pageSize } = normalizePagination({
    page: c.req.query("page") ?? null,
    pageSize: c.req.query("pageSize") ?? null,
  });
  const where = { providerId: provider.id };
  const [total, inquiries] = await Promise.all([
    db.inquiry.count({ where }),
    db.inquiry.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  const unread = await unreadCounts(inquiries, "PROVIDER");

  return c.json({
    inquiries: inquiries.map((i) => ({ ...i, unreadCount: unread[i.id] ?? 0 })),
    total,
    page,
    pageSize,
  });
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
// Sensitive PII: stored under the media `verification` prefix, which the
// gateway routes to the admin-gated serve route below instead of the public
// media path (#500) — so the bytes are only ever viewable by ADMIN/SUPPORT.
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

  // Upload every document to media FIRST, so a media failure (service down, or
  // a payload media re-rejects) can't destroy the provider's previous
  // submission — the delete + recreate only runs once all uploads succeed.
  const stored: { kind: (typeof uploads)[number]["kind"]; url: string }[] = [];
  for (const { kind, file } of uploads) {
    try {
      stored.push({ kind, url: await storeImage("provider", file, "verification") });
    } catch (e) {
      if (e instanceof InvalidImageError) return c.json({ error: e.message }, 400);
      throw e;
    }
  }

  // Swap the document set and advance status atomically.
  await db.$transaction([
    db.verificationDocument.deleteMany({ where: { providerId: provider.id } }),
    ...stored.map((s) =>
      db.verificationDocument.create({
        data: { providerId: provider.id, kind: s.kind, url: s.url },
      })
    ),
    db.provider.update({
      where: { id: provider.id },
      data: { verificationStatus: "PENDING", verifiedAt: null },
    }),
  ]);

  return c.json({ status: "PENDING" });
});

// Admin-gated delivery of a verification document (#500). These are PII (NIC /
// business-registration scans), so the gateway routes
// /api/files/provider/verification/* here — NOT to the public media path — and
// only ADMIN/SUPPORT (who see the /api/admin/verifications queue that lists
// them) may fetch the bytes. The document's stored URL is exactly this request
// path, so we hand it straight to media's internal raw endpoint over S2S and
// stream the bytes back; PII is marked private/no-store so it is never cached
// by a shared cache. Pre-existing documents keep the same URL and are served
// unchanged through this route.
providerDashboardRoutes.get("/api/files/provider/verification/*", async (c) => {
  if (!isSupportOrAdmin(c)) {
    return c.json({ error: "Forbidden" }, 403);
  }
  const res = await s2s(
    MEDIA_SERVICE_URL,
    `/internal/media/raw?url=${encodeURIComponent(c.req.path)}`
  );
  if (!res.ok) {
    return c.json({ error: "Not found" }, 404);
  }
  return c.body(new Uint8Array(await res.arrayBuffer()), 200, {
    "content-type": res.headers.get("content-type") ?? "application/octet-stream",
    "cache-control": "private, no-store",
    "x-content-type-options": "nosniff",
    "content-disposition": "inline",
  });
});
