// Public provider directory + profile endpoints (behavior ported from the
// monolith's /api/providers routes and the /providers pages). `name` comes
// from the denormalized contact columns instead of the old user join.
import { Hono } from "hono";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { moderateContent } from "../lib/auto-report";
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
import { log } from "../lib/log";
import { sortProviders, type Sortable } from "../lib/sort";

export const providersRoutes = new Hono();

// Upper bound on providers loaded for in-memory ranking of a browse query.
// Keeps memory + the ratings fan-out bounded; well above any realistic v0.1
// match set. If ever hit, we log and serve the newest slice (see below).
const MAX_BROWSE_CANDIDATES = 1000;

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
    // Cover photo = first photo of the provider's manual order (falls back to
    // newest-first while everything still has the default sortOrder 0).
    orderBy: [{ sortOrder: "asc" as const }, { createdAt: "desc" as const }],
  },
};

// Cover-image fallback map (#436): slug → category cover, attached to each card
// so the web can fall back provider cover → category image → placeholder
// without a per-card lookup.
//
// This runs on the hottest endpoints (every /api/providers browse plus the
// favorites `ids=` path), so the slug→imageUrl map is memoized in-process for
// 60s (#523) — the same TTL as the category-slug validator in lib/categories.ts
// — instead of hitting the DB on every request. Categories change rarely; a
// freshly uploaded cover simply shows up within the TTL window.
const CATEGORY_IMAGE_TTL_MS = 60_000;
let categoryImageCache: Map<string, string | null> | null = null;
let categoryImageExpiresAt = 0;

async function categoryImageMap(): Promise<Map<string, string | null>> {
  const now = Date.now();
  if (categoryImageCache && categoryImageExpiresAt > now) return categoryImageCache;
  const rows = await db.category.findMany({
    select: { slug: true, imageUrl: true },
  });
  categoryImageCache = new Map(rows.map((c) => [c.slug, c.imageUrl]));
  categoryImageExpiresAt = now + CATEGORY_IMAGE_TTL_MS;
  return categoryImageCache;
}

// Tests only — drop the memoized map so a case starts from a cold cache.
export function __resetCategoryImageCache() {
  categoryImageCache = null;
  categoryImageExpiresAt = 0;
}

function toCardDTO(
  p: CardRow,
  r: RatingEntry | undefined,
  categoryImages?: Map<string, string | null>
) {
  return {
    id: p.id,
    userId: p.userId,
    name: p.contactName,
    category: p.category,
    categoryImageUrl: categoryImages?.get(p.category) ?? null,
    headline: p.headline,
    // Optional Sinhala headline (#515) so the web card can show the locale
    // variant with an English fallback. Bio is not on the card.
    headlineSi: p.headlineSi,
    district: p.district,
    // Full served set (#502) — always contains the primary district; the card
    // can surface "also serves" coverage without another fetch.
    serviceDistricts: p.serviceDistricts,
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
    // Dedicated cover (#435) wins; otherwise fall back to the first work photo,
    // then (in the web card) to the category image.
    coverPhoto: p.coverPhoto ?? p.photos[0]?.url ?? null,
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

// Contact identity for the public payloads. Phone numbers are deliberately
// omitted here (#64) — see contactFlags / the /:id/contact reveal below.
function contactAsUser(p: { contactName: string; contactEmail: string }) {
  return { name: p.contactName, email: p.contactEmail };
}

// Phone numbers are PII and a prime scraping target (#64): never ship the raw
// digits in the public directory payloads, or a crawler harvests every number
// in one pass. Instead we surface booleans so the UI knows whether a "show
// number" affordance applies; the web reveals the actual digits on an explicit
// user action via POST /:id/contact (rate-limited at the gateway).
function contactFlags(p: {
  contactPhone: string | null;
  whatsapp: string | null;
  phone2: string | null;
}) {
  return {
    hasPhone: !!p.contactPhone,
    hasWhatsapp: !!p.whatsapp,
    hasPhone2: !!p.phone2,
  };
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
      .filter(Boolean)
      .slice(0, 500); // bound the IN (...) clause — favorites lists are small
    const rows = ids.length
      ? await db.provider.findMany({
          where: { id: { in: ids }, suspended: false },
          include: cardInclude,
        })
      : [];
    const byId = new Map(rows.map((p) => [p.id, p]));
    const ordered = ids.flatMap((id) => byId.get(id) ?? []);
    const ratings = await fetchRatings(ordered.map((p) => p.id));
    const catImages = await categoryImageMap();
    const providers = ordered.map((p) => toCardDTO(p, ratings[p.id], catImages));
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

  // Rating and starting price are derived data (starting price is joined,
  // rating is owned by review-service), so ranking happens in memory across the
  // match set. To keep that bounded we load at most MAX_BROWSE_CANDIDATES rows
  // (newest first) instead of the whole table; the ratings fan-out is chunked
  // in fetchRatings. Full DB-side ranking would need rating denormalized onto
  // Provider — tracked as a follow-up. At current scale the cap is never hit.
  const rows = await db.provider.findMany({
    where,
    include: cardInclude,
    orderBy: { createdAt: "desc" },
    take: MAX_BROWSE_CANDIDATES + 1,
  });
  if (rows.length > MAX_BROWSE_CANDIDATES) {
    rows.length = MAX_BROWSE_CANDIDATES;
    log.warn("provider browse hit candidate cap — results may be incomplete", {
      cap: MAX_BROWSE_CANDIDATES,
    });
  }
  const ratings = await fetchRatings(rows.map((p) => p.id));
  const catImages = await categoryImageMap();

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
      dto: toCardDTO(p, r, catImages),
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
      photos: {
        where: { deletedAt: null },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      },
    },
  });
  if (!provider) {
    return c.json({ error: "Provider not found" }, 404);
  }
  // Suspended profiles are hidden from the public (same gate as /:id/full and
  // the browse listing); without this, a suspended provider's full record —
  // including contact PII — leaks to anyone holding the id.
  if (provider.suspended && getAuth(c)?.role !== "ADMIN") {
    return c.json({ error: "Provider not found" }, 404);
  }
  // Strip the raw phone columns (#64) — the public payload carries only
  // booleans; the digits are fetched on demand via POST /:id/contact. Also drop
  // rejectionReason (#506): it's admin-authored moderation text and must never
  // reach a public caller (a REJECTED-but-live provider would otherwise leak
  // it). It stays only on the owner-gated dashboard.
  const { contactPhone, whatsapp, phone2, rejectionReason, ...pub } = provider;
  return c.json({
    provider: {
      ...pub,
      // Effective availability (#49) — raw awayUntil rides along.
      available: isEffectivelyAvailable(provider),
      ...contactFlags(provider),
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
// avgResponseMs is computed over the most recent answered inquiries only
// (#372) — a rolling sample keeps the query bounded and tracks the provider's
// current responsiveness rather than their all-time history.
const RESPONSE_TIME_SAMPLE = 200;

// Full page payload for /providers/[id]: services (price asc), first
// FULL_PHOTOS_TAKE photos (sortOrder asc then createdAt desc — the provider's
// manual order, photosTotal alongside) and the
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
        orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
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
      orderBy: { respondedAt: "desc" },
      take: RESPONSE_TIME_SAMPLE,
    }),
  ]);
  // Drop _count (internal), the raw phone columns (#64) — the profile page
  // reveals the digits on demand via POST /:id/contact — and rejectionReason
  // (#506), which is admin-only moderation text kept off every public payload.
  const { _count, contactPhone, whatsapp, phone2, rejectionReason, ...providerFields } =
    provider;
  return c.json({
    provider: {
      ...providerFields,
      // Effective availability (#49): away providers surface available=false;
      // the profile page renders "Away until {awayUntil}" from the raw field.
      available: isEffectivelyAvailable(provider),
      ...contactFlags(provider),
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

// Phone-number reveal (#64). The public detail/profile payloads omit the raw
// digits; the web fetches them here on an explicit "show number" action. It is
// a POST (not a GET) so the gateway's rate limiter — which only guards writes —
// throttles mass harvesting per IP without exposing every number in the
// initial HTML. Suspended profiles stay hidden (same gate as the detail
// routes); admins moderating a suspended profile still get through.
providersRoutes.post("/api/providers/:id/contact", async (c) => {
  const id = c.req.param("id");
  const provider = await db.provider.findUnique({
    where: { id },
    select: { contactPhone: true, whatsapp: true, phone2: true, suspended: true },
  });
  if (!provider) {
    return c.json({ error: "Provider not found" }, 404);
  }
  if (provider.suspended && getAuth(c)?.role !== "ADMIN") {
    return c.json({ error: "Provider not found" }, 404);
  }
  return c.json({
    phone: provider.contactPhone,
    whatsapp: provider.whatsapp,
    phone2: provider.phone2,
  });
});

const inquirySchema = z.object({
  name: z.string().min(2).max(80),
  phone: slPhone,
  email: z.string().email().optional().or(z.literal("")),
  message: z.string().min(10).max(2000),
  // Attribution for analytics (#11). Enum-restricted; the plain web form
  // simply omits it.
  source: z.enum(["chat-agent"]).optional(),
  // Honeypot decoy (#65). The web form renders a matching field that is hidden
  // and inert for real users (off-screen, aria-hidden, tabindex -1), so humans
  // never fill it. Bots that blindly complete every input leave it non-empty.
  // Bounded so a filled value can't be an unbounded-body vector. Other clients
  // (e.g. the chat agent) simply omit it. See docs/RATE_LIMITING.md.
  company: z.string().max(200).optional(),
});

providersRoutes.post("/api/providers/:id/inquiries", async (c) => {
  const id = c.req.param("id");
  const provider = await db.provider.findUnique({ where: { id } });
  if (!provider) {
    return c.json({ error: "Provider not found" }, 404);
  }
  // Suspended (hidden) profiles are 404 to non-admins on every other route
  // (#361): gate the inquiry-create path too, or we'd leak that a hidden
  // profile exists, email the suspended provider, and let the caller
  // permanently satisfy the review-eligibility gate.
  if (provider.suspended && getAuth(c)?.role !== "ADMIN") {
    return c.json({ error: "Provider not found" }, 404);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = inquirySchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, 400);
  }

  // Bot filter (#65): a non-empty honeypot means a script filled the hidden
  // decoy. This is the authoritative, server-side check — the client control
  // is only a delivery mechanism. Respond with the same success-shaped 200 as a
  // real submission (silent drop): nothing is persisted and no provider email
  // is sent, but a scripted caller can't tell it was filtered, so it has no
  // signal to adapt. Complements the gateway's per-IP `inquiry` rate limit;
  // does not replace it. See docs/RATE_LIMITING.md.
  if (parsed.data.company && parsed.data.company.trim() !== "") {
    return c.json({ inquiry: null });
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
      source: parsed.data.source ?? null,
    },
  });

  // Content filter (#375): AFTER the write on purpose — the inquiry is
  // delivered as normal and a filter hit only queues a SYSTEM report for
  // admin triage.
  await moderateContent("INQUIRY", inquiry.id, {
    name: parsed.data.name,
    message: parsed.data.message,
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
