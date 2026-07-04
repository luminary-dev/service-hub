// Public provider directory + profile endpoints (behavior ported from the
// monolith's /api/providers routes and the /providers pages). `name` comes
// from the denormalized contact columns instead of the old user join.
import { Hono } from "hono";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { getAuth, getLocale, getOrigin } from "../lib/http";
import {
  fetchProviderReviews,
  fetchRatings,
  fetchReviewCount,
  sendInquiryEmail,
  type RatingEntry,
} from "../lib/clients";
import { isEffectivelyAvailable } from "../lib/availability";
import { slPhone } from "../lib/field-rules";
import { normalizeListQuery } from "../lib/query";
import { averageResponseMs } from "../lib/response-time";
import { buildBrowseWhere } from "../lib/search";
import { sortProviders, type Sortable } from "../lib/sort";

export const providersRoutes = new Hono();

// Public category list for browse filters and forms (#135/#60). Active only —
// deactivated categories disappear from pickers while existing providers keep
// their slug.
providersRoutes.get("/api/categories", async (c) => {
  const rows = await db.category.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { labelEn: "asc" }],
    select: { slug: true, labelEn: true, labelSi: true, icon: true },
  });
  return c.json({ categories: rows });
});

type CardRow = Prisma.ProviderGetPayload<{
  include: { services: true; photos: true };
}>;

const cardInclude = {
  services: { orderBy: { price: "asc" as const }, take: 1 },
  photos: {
    where: { deletedAt: null },
    take: 1,
    orderBy: { createdAt: "desc" as const },
  },
};

function toCardDTO(p: CardRow, r: RatingEntry | undefined) {
  return {
    id: p.id,
    userId: p.userId,
    name: p.contactName,
    category: p.category,
    headline: p.headline,
    district: p.district,
    city: p.city,
    experience: p.experience,
    // Effective availability (#49): an away provider reports available=false;
    // awayUntil lets the web render "Away until {date}" instead.
    available: isEffectivelyAvailable(p),
    awayUntil: p.awayUntil,
    verificationStatus: p.verificationStatus,
    verifiedAt: p.verifiedAt,
    createdAt: p.createdAt,
    avatarUrl: p.avatarUrl,
    coverPhoto: p.photos[0]?.url ?? null,
    photos: p.photos.slice(0, 1).map((ph) => ({ url: ph.url, caption: ph.caption })),
    services: p.services
      .slice(0, 1)
      .map((s) => ({ id: s.id, title: s.title, price: s.price, priceType: s.priceType })),
    fromPrice: p.services[0]?.price ?? null,
    fromPriceType: p.services[0]?.priceType ?? null,
    rating: r?.rating ?? null,
    reviewCount: r?.count ?? 0,
  };
}

function contactAsUser(p: { contactName: string; contactPhone: string | null; contactEmail: string }) {
  return { name: p.contactName, phone: p.contactPhone, email: p.contactEmail };
}

providersRoutes.get("/api/providers", async (c) => {
  const query = c.req.query();
  const q = query.q?.trim();
  const category = query.category;
  const district = query.district;
  const { page, pageSize, sort, priceMin, priceMax, ratingMin, availableOnly } =
    normalizeListQuery({
      page: query.page ?? null,
      pageSize: query.pageSize ?? null,
      take: query.take ?? null,
      sort: query.sort ?? null,
      priceMin: query.priceMin ?? null,
      priceMax: query.priceMax ?? null,
      ratingMin: query.ratingMin ?? null,
      availableOnly: query.availableOnly ?? null,
    });

  // ids= returns exactly those providers (suspended excluded) in input order —
  // used by the account/favorites page. No sorting or pagination.
  if (query.ids !== undefined) {
    const ids = query.ids
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const rows = ids.length
      ? await db.provider.findMany({
          where: { id: { in: ids }, suspended: false },
          include: cardInclude,
        })
      : [];
    const byId = new Map(rows.map((p) => [p.id, p]));
    const ordered = ids.flatMap((id) => byId.get(id) ?? []);
    const ratings = await fetchRatings(ordered.map((p) => p.id));
    const providers = ordered.map((p) => toCardDTO(p, ratings[p.id]));
    return c.json({
      providers,
      total: providers.length,
      page: 1,
      pageSize: providers.length,
    });
  }

  // #128: free text also matches categories by their English AND Sinhala
  // labels ("mechanic", "කාර්මික" → mechanic providers). Inactive categories
  // are included on purpose — existing providers keep a deactivated slug and
  // must stay findable.
  const categorySlugs = q
    ? (
        await db.category.findMany({
          where: {
            OR: [
              { labelEn: { contains: q, mode: "insensitive" } },
              { labelSi: { contains: q, mode: "insensitive" } },
            ],
          },
          select: { slug: true },
        })
      ).map((r) => r.slug)
    : [];

  // The ILIKE search inside is backed by pg_trgm GIN indexes (see migration
  // 20260704210000_search_trgm) so it scales past a sequential scan.
  const where: Prisma.ProviderWhereInput = buildBrowseWhere({
    q,
    categorySlugs,
    category,
    district,
    priceMin,
    priceMax,
    availableOnly,
  });

  // Rating and starting price are derived data, so (matching the monolith's
  // providers page) we rank in memory across the full match set and paginate
  // afterwards. Fine at the current scale.
  const rows = await db.provider.findMany({ where, include: cardInclude });
  const ratings = await fetchRatings(rows.map((p) => p.id));

  const enriched: (Sortable & { dto: ReturnType<typeof toCardDTO> })[] = rows.map((p) => {
    const r = ratings[p.id];
    const rating = r?.rating ?? null;
    const count = r?.count ?? 0;
    return {
      rating,
      ratingSum: rating !== null ? rating * count : 0,
      reviewCount: count,
      fromPrice: p.services[0]?.price ?? null,
      experience: p.experience,
      createdAt: p.createdAt,
      verified: p.verificationStatus === "VERIFIED",
      dto: toCardDTO(p, r),
    };
  });

  // ratingMin (#47) is applied here, after S2S rating hydration — ratings are
  // derived data owned by review-service, so filtering (like ranking) happens
  // in memory across the match set, before sort + pagination. Providers with
  // no reviews are excluded by any minimum.
  const filtered =
    ratingMin !== null
      ? enriched.filter((e) => e.rating !== null && e.rating >= ratingMin)
      : enriched;

  const total = filtered.length;
  const results = sortProviders(filtered, sort)
    .slice((page - 1) * pageSize, page * pageSize)
    .map((e) => e.dto);

  return c.json({ providers: results, total, page, pageSize });
});

// Sitemap feed: every non-suspended provider id + updatedAt.
providersRoutes.get("/api/providers/ids", async (c) => {
  const providers = await db.provider.findMany({
    where: { suspended: false },
    select: { id: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
  });
  return c.json({ providers });
});

providersRoutes.get("/api/stats", async (c) => {
  const [providerCount, reviewCount] = await Promise.all([
    db.provider.count({ where: { suspended: false } }),
    fetchReviewCount(),
  ]);
  return c.json({ providerCount, reviewCount });
});

// Legacy detail shape (kept for existing consumers): provider incl. services
// and photos, contact exposed as `user`. Reviews are NOT included any more —
// they live in review-service and are served via /:id/full.
providersRoutes.get("/api/providers/:id", async (c) => {
  const id = c.req.param("id");
  const provider = await db.provider.findUnique({
    where: { id },
    include: {
      services: true,
      photos: { where: { deletedAt: null }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!provider) {
    return c.json({ error: "Provider not found" }, 404);
  }
  return c.json({
    provider: {
      ...provider,
      // Effective availability (#49) — raw awayUntil rides along.
      available: isEffectivelyAvailable(provider),
      user: contactAsUser(provider),
    },
  });
});

// Bounds for the /full composition: profile pages must not grow unbounded
// with a provider's history. Deeper pages come from the paginated public
// reviews endpoint (web lazy-load) — photos beyond the cap have no public
// consumer yet (photosTotal tells the UI they exist).
const FULL_PHOTOS_TAKE = 50;
const FULL_REVIEWS_TAKE = 50;

// Full page payload for /providers/[id]: services (price asc), first
// FULL_PHOTOS_TAKE photos (createdAt desc, photosTotal alongside) and the
// first page of reviews hydrated from review-service (degrades to [];
// reviewsTake/reviewsCursor thread through, reviewsNextCursor comes back).
// Suspended profiles are hidden from the public; admins moderate via /admin.
providersRoutes.get("/api/providers/:id/full", async (c) => {
  const id = c.req.param("id");
  const provider = await db.provider.findUnique({
    where: { id },
    include: {
      services: { orderBy: { price: "asc" } },
      photos: {
        where: { deletedAt: null },
        orderBy: { createdAt: "desc" },
        take: FULL_PHOTOS_TAKE,
      },
      _count: { select: { photos: { where: { deletedAt: null } } } },
    },
  });
  if (!provider) {
    return c.json({ error: "Provider not found" }, 404);
  }
  const auth = getAuth(c);
  if (provider.suspended && auth?.role !== "ADMIN") {
    return c.json({ error: "Provider not found" }, 404);
  }

  const rawTake = Math.floor(Number(c.req.query("reviewsTake")));
  const reviewsTake =
    Number.isFinite(rawTake) && rawTake >= 1
      ? Math.min(rawTake, 100)
      : FULL_REVIEWS_TAKE;
  const [{ reviews, nextCursor }, answered] = await Promise.all([
    fetchProviderReviews(id, {
      take: reviewsTake,
      cursor: c.req.query("reviewsCursor") || undefined,
    }),
    db.inquiry.findMany({
      where: { providerId: id, respondedAt: { not: null } },
      select: { createdAt: true, respondedAt: true },
    }),
  ]);
  const { _count, ...providerFields } = provider;
  return c.json({
    provider: {
      ...providerFields,
      // Effective availability (#49): away providers surface available=false;
      // the profile page renders "Away until {awayUntil}" from the raw field.
      available: isEffectivelyAvailable(provider),
      user: contactAsUser(provider),
      reviews,
      reviewsNextCursor: nextCursor,
      photosTotal: _count.photos,
      avgResponseMs: averageResponseMs(answered),
    },
  });
});

// OG-image payload (the web app renders the image; suspended profiles fall
// back to the generic card there, so this returns the flag rather than a 404).
providersRoutes.get("/api/providers/:id/card", async (c) => {
  const id = c.req.param("id");
  const provider = await db.provider.findUnique({
    where: { id },
    select: {
      contactName: true,
      category: true,
      city: true,
      district: true,
      suspended: true,
      verificationStatus: true,
    },
  });
  if (!provider) {
    return c.json({ error: "Provider not found" }, 404);
  }
  const ratings = await fetchRatings([id]);
  const r = ratings[id];
  return c.json({
    name: provider.contactName,
    category: provider.category,
    city: provider.city,
    district: provider.district,
    suspended: provider.suspended,
    rating: r?.rating ?? null,
    reviewCount: r?.count ?? 0,
    verificationStatus: provider.verificationStatus,
  });
});

const inquirySchema = z.object({
  name: z.string().min(2).max(80),
  phone: slPhone,
  email: z.string().email().optional().or(z.literal("")),
  message: z.string().min(10).max(2000),
});

providersRoutes.post("/api/providers/:id/inquiries", async (c) => {
  const id = c.req.param("id");
  const provider = await db.provider.findUnique({ where: { id } });
  if (!provider) {
    return c.json({ error: "Provider not found" }, 404);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = inquirySchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, 400);
  }

  const auth = getAuth(c);
  const inquiry = await db.inquiry.create({
    data: {
      providerId: id,
      userId: auth?.userId ?? null,
      name: parsed.data.name,
      phone: parsed.data.phone,
      email: parsed.data.email || null,
      message: parsed.data.message,
    },
  });

  // Tell the provider (denormalized contactEmail) — best-effort, never fails
  // the inquiry.
  await sendInquiryEmail({
    to: provider.contactEmail,
    url: `${getOrigin(c)}/dashboard`,
    customerName: parsed.data.name,
    locale: getLocale(c),
  });

  return c.json({ inquiry });
});
