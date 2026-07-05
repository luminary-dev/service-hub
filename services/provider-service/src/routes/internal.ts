// Internal endpoints for sibling services (already behind the internal-secret
// middleware). Never routed by the gateway.
import { Hono } from "hono";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "../db";
import { removeStoredFile, sweepMedia } from "../lib/storage";

export const internalRoutes = new Hono();

// Bound on how many ids a batch lookup will accept, so a caller (or attacker)
// can't force a single giant IN (...) clause. Comfortably above realistic
// favorite / job-response fan-out.
const MAX_BATCH_IDS = 500;

const optionalText = (max: number) =>
  z.string().max(max).optional().or(z.literal("")).nullish();

const createSchema = z.object({
  userId: z.string().min(1),
  name: z.string().min(1).max(80),
  email: z.string().min(1),
  phone: z.string().max(15).nullish(),
  category: z.string().min(1),
  headline: z.string().min(1).max(120),
  bio: z.string().min(1).max(2000),
  district: z.string().min(1),
  city: z.string().min(1).max(60),
  experience: z.number().int().min(0).max(60),
  whatsapp: optionalText(15),
  phone2: optionalText(15),
  facebook: optionalText(200),
  instagram: optionalText(200),
  tiktok: optionalText(200),
  youtube: optionalText(200),
  website: optionalText(200),
  services: z
    .array(
      z.object({
        title: z.string().min(2).max(100),
        description: z.string().max(500).optional(),
        price: z.number().positive(),
        priceType: z.enum(["HOURLY", "DAILY", "FIXED", "VISIT"]),
      })
    )
    .min(1)
    .max(20),
});

// Full category list for sibling services' validation caches (#135/#60).
// Includes inactive entries (with the active flag) so a provider whose
// category was later deactivated still validates everywhere.
internalRoutes.get("/internal/categories", async (c) => {
  const categories = await db.category.findMany({
    orderBy: [{ sortOrder: "asc" }, { labelEn: "asc" }],
  });
  return c.json({ categories });
});

// Registration orchestration (called by identity-service): creates the
// provider with its denormalized contact fields and nested services.
internalRoutes.post("/internal/providers", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid input" }, 400);
  }
  const data = parsed.data;

  try {
    const provider = await db.provider.create({
      data: {
        userId: data.userId,
        contactName: data.name,
        contactEmail: data.email,
        contactPhone: data.phone || null,
        category: data.category,
        headline: data.headline,
        bio: data.bio,
        district: data.district,
        city: data.city,
        experience: data.experience,
        whatsapp: data.whatsapp || null,
        phone2: data.phone2 || null,
        facebook: data.facebook || null,
        instagram: data.instagram || null,
        tiktok: data.tiktok || null,
        youtube: data.youtube || null,
        website: data.website || null,
        services: {
          create: data.services.map((s) => ({
            title: s.title,
            description: s.description || null,
            price: s.price,
            priceType: s.priceType,
          })),
        },
      },
    });
    return c.json({ id: provider.id });
  } catch (e) {
    // userId is unique: a retried/concurrent registration for the same user
    // must be idempotent, not an unhandled 500. Return the existing id.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const existing = await db.provider.findUnique({
        where: { userId: data.userId },
        select: { id: true },
      });
      if (existing) return c.json({ id: existing.id });
    }
    throw e;
  }
});

// Login / job-board gate: the provider owned by a user, if any.
internalRoutes.get("/internal/providers/by-user/:userId", async (c) => {
  const userId = c.req.param("userId");
  const provider = await db.provider.findUnique({
    where: { userId },
    select: {
      id: true,
      userId: true,
      category: true,
      district: true,
      contactName: true,
    },
  });
  return c.json({ provider: provider ?? null });
});

// Batch hydration (job-service response lists).
internalRoutes.get("/internal/providers", async (c) => {
  const idsParam = c.req.query("ids") ?? "";
  const ids = idsParam
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, MAX_BATCH_IDS);
  const providers = ids.length
    ? await db.provider.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          userId: true,
          contactName: true,
          contactPhone: true,
          suspended: true,
        },
      })
    : [];
  return c.json({ providers });
});

// Review gating (review-service): has this user ever sent this provider an
// inquiry? Anonymous inquiries carry userId=null, so they never match.
internalRoutes.get("/internal/inquiries/exists", async (c) => {
  const providerId = c.req.query("providerId");
  const userId = c.req.query("userId");
  if (!providerId || !userId) {
    return c.json({ error: "providerId and userId are required" }, 400);
  }
  const inquiry = await db.inquiry.findFirst({
    where: { providerId, userId },
    select: { id: true },
  });
  return c.json({ exists: inquiry !== null });
});

// POST /internal/users/:id/erase — account-deletion fan-out from
// identity-service. Deletes the user's Provider (Service/WorkPhoto/
// VerificationDocument/Inquiry rows cascade) plus its stored upload files
// (best-effort), and the Inquiry rows this user sent to other providers.
// Idempotent: erasing an unknown user is a no-op 200.
internalRoutes.post("/internal/users/:id/erase", async (c) => {
  const userId = c.req.param("id");

  const provider = await db.provider.findUnique({
    where: { userId },
    include: {
      photos: { select: { url: true } },
      verificationDocs: { select: { url: true } },
    },
  });
  if (provider) {
    await db.provider.delete({ where: { id: provider.id } });
    for (const f of [
      ...provider.photos.map((p) => p.url),
      ...provider.verificationDocs.map((d) => d.url),
      ...(provider.avatarUrl ? [provider.avatarUrl] : []),
    ]) {
      await removeStoredFile(f);
    }
  }

  // Inquiries this user sent to other providers (anonymous ones carry no
  // userId and are untouched by design).
  await db.inquiry.deleteMany({ where: { userId } });

  return c.json({ ok: true });
});

// Periodic maintenance (#36): remove stored upload files no database row
// references any more. Grace window protects in-flight uploads; run it from
// ops tooling (cron/curl with the internal secret).
internalRoutes.post("/internal/maintenance/sweep-orphans", async (c) => {
  const [photos, docs, avatars] = await Promise.all([
    db.workPhoto.findMany({ select: { url: true } }),
    db.verificationDocument.findMany({ select: { url: true } }),
    db.provider.findMany({
      where: { avatarUrl: { not: null } },
      select: { avatarUrl: true },
    }),
  ]);
  const referenced = new Set<string>([
    ...photos.map((p) => p.url),
    ...docs.map((d) => d.url),
    ...avatars.map((a) => a.avatarUrl as string),
  ]);
  const result = await sweepMedia("provider", [...referenced]);
  return c.json(result);
});

// Existence/suspended check (favorites, reviews). Always 200 — the caller
// decides its own 404 semantics.
internalRoutes.get("/internal/providers/:id/summary", async (c) => {
  const id = c.req.param("id");
  const provider = await db.provider.findUnique({
    where: { id },
    select: { id: true, userId: true, suspended: true },
  });
  return c.json({ provider: provider ?? null });
});
