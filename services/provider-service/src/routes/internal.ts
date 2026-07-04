// Internal endpoints for sibling services (already behind the internal-secret
// middleware). Never routed by the gateway.
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db";

export const internalRoutes = new Hono();

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

// Registration orchestration (called by identity-service): creates the
// provider with its denormalized contact fields and nested services.
internalRoutes.post("/internal/providers", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid input" }, 400);
  }
  const data = parsed.data;

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
    .filter(Boolean);
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
