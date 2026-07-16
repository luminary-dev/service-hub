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
  fetchReviewCount,
  isEmailVerified,
} from "../lib/clients";
import { emitNotification } from "../lib/notify";
import { isEffectivelyAvailable } from "../lib/availability";
import { slPhone } from "../lib/field-rules";
import { moneyToNumber, moneyToNumberOrNull } from "../lib/money";
import { normalizeListQuery } from "../lib/query";
import { averageResponseMs } from "../lib/response-time";
import { browseCountQuery, browseIdsQuery } from "../lib/browse-query";
import { log } from "../lib/log";

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

export type CardRow = Prisma.ProviderGetPayload<{
  include: { services: true; photos: true };
}>;

// Exported for the S2S card hydration endpoint (routes/internal.ts): the
// search-service query plane returns ranked ids and hydrates the SAME card
// DTO from here, so display data stays single-sourced (search RFC §4.1).
export const cardInclude = {
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

export async function categoryImageMap(): Promise<Map<string, string | null>> {
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

export function toCardDTO(
  p: CardRow,
  categoryImages?: Map<string, string | null>
) {
  // Rating comes from the denormalized columns (#748) — no per-request fan-out
  // to review-service. A 0 count means "no reviews", which the card renders as a
  // null rating (matching the old RatingEntry-absent behavior). search-service's
  // card hydration overlays its own aggregates on top, so emitting the column
  // value here is harmless for that path too.
  const rating = p.ratingCount > 0 ? p.ratingAvg : null;
  return {
    id: p.id,
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
      .map((s) => ({ id: s.id, title: s.title, price: moneyToNumber(s.price), priceType: s.priceType })),
    fromPrice: moneyToNumberOrNull(p.services[0]?.price),
    fromPriceType: p.services[0]?.priceType ?? null,
    rating,
    reviewCount: p.ratingCount,
    // Map pin (#48), included only when set — the same already-public
    // coordinates the profile payloads carry, so the map view (search RFC
    // phase 3) can place card markers without another fetch. Real pins only;
    // district centroids are never substituted.
    ...(p.latitude !== null && p.longitude !== null
      ? { latitude: p.latitude, longitude: p.longitude }
      : {}),
  };
}

// Contact identity for the public payloads. The email address is PII too
// (#655) — it is deliberately omitted here alongside the phone numbers (#64);
// see contactFlags / the /:id/contact reveal below. Only the display name,
// which the directory already shows publicly, rides along.
function contactAsUser(p: { contactName: string }) {
  return { name: p.contactName };
}

// Phone numbers AND the contact email are PII and a prime scraping target
// (#64/#655): never ship the raw digits or address in the public directory
// payloads, or a crawler harvests every one in a single pass. Instead we
// surface booleans so the UI knows whether a "show contact" affordance
// applies; the web reveals the actual values on an explicit user action via
// POST /:id/contact (rate-limited at the gateway).
function contactFlags(p: {
  contactPhone: string | null;
  whatsapp: string | null;
  phone2: string | null;
  contactEmail: string;
}) {
  return {
    hasPhone: !!p.contactPhone,
    hasWhatsapp: !!p.whatsapp,
    hasPhone2: !!p.phone2,
    hasEmail: !!p.contactEmail,
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
    const catImages = await categoryImageMap();
    const providers = ordered.map((p) => toCardDTO(p, catImages));
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

  // Filter, sort, paginate and count all run DB-side now (#748). Rating is no
  // longer derived per-request: ratingAvg/ratingCount are denormalized onto
  // Provider (kept fresh by review-service's write-back), so the ratingMin
  // filter and the rating/reviews/recommended sorts are column predicates. The
  // two sorts Prisma orderBy can't express (`price` = MIN over a to-many
  // relation, `recommended` = a computed Bayesian score) live in the raw-SQL
  // builder; the ILIKE search is still backed by the pg_trgm GIN indexes (see
  // migration 20260704210000_search_trgm). We select the ordered, paginated id
  // slice + the real `total` in Postgres, then hydrate the card DTOs for that
  // slice with a single findMany so the card shape stays single-sourced. No
  // candidate cap, no rating fan-out.
  const filters = {
    q,
    categorySlugs,
    category,
    district,
    priceMin,
    priceMax,
    availableOnly,
    ratingMin,
  };
  const now = new Date();
  const offset = (page - 1) * pageSize;
  const [idRows, countRows] = await Promise.all([
    db.$queryRaw<{ id: string }[]>(
      browseIdsQuery(filters, sort, pageSize, offset, now)
    ),
    db.$queryRaw<{ count: number }[]>(browseCountQuery(filters, now)),
  ]);
  const total = Number(countRows[0]?.count ?? 0);
  const ids = idRows.map((r) => r.id);

  const rows = ids.length
    ? await db.provider.findMany({
        where: { id: { in: ids } },
        include: cardInclude,
      })
    : [];
  const byId = new Map(rows.map((p) => [p.id, p]));
  const catImages = await categoryImageMap();
  // Re-order the hydrated rows back into the DB-ranked id order (findMany does
  // not preserve the IN (...) order).
  const results = ids.flatMap((id) => {
    const p = byId.get(id);
    return p ? [toCardDTO(p, catImages)] : [];
  });

  return c.json({ providers: results, total, page, pageSize });
});

// Sitemap feed: non-suspended provider ids + updatedAt, id-cursor paginated
// (#766). This is an anonymous, unthrottled route (the gateway only GET-rate-
// limits /api/search/*), so it used to load the entire provider table in one
// statement on every render — a cheap externally-triggerable load lever that
// grows linearly with provider count. It now returns a bounded page ordered by
// the stable `id` cursor (updatedAt is not unique, so it can't page reliably)
// plus a `nextCursor`; a sitemap-index consumer walks the pages until
// nextCursor is null. `?cursor=` continues after the last id seen; `?take=`
// (default SITEMAP_DEFAULT_TAKE, max SITEMAP_MAX_TAKE) sizes the page.
const SITEMAP_DEFAULT_TAKE = 1000;
const SITEMAP_MAX_TAKE = 5000;

providersRoutes.get("/api/providers/ids", async (c) => {
  const rawTake = Math.floor(Number(c.req.query("take")));
  const take =
    Number.isFinite(rawTake) && rawTake >= 1
      ? Math.min(rawTake, SITEMAP_MAX_TAKE)
      : SITEMAP_DEFAULT_TAKE;
  const cursor = c.req.query("cursor") || undefined;
  const rows = await db.provider.findMany({
    where: { suspended: false },
    select: { id: true, updatedAt: true },
    orderBy: { id: "asc" },
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    take: take + 1,
  });
  const hasMore = rows.length > take;
  if (hasMore) rows.length = take;
  return c.json({
    providers: rows,
    nextCursor: hasMore ? rows[rows.length - 1]!.id : null,
  });
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
  const auth = getAuth(c);
  if (provider.suspended && auth?.role !== "ADMIN") {
    return c.json({ error: "Provider not found" }, 404);
  }
  // Strip the raw phone columns (#64) and the contact email (#655) — the public
  // payload carries only booleans; the digits/address are fetched on demand via
  // POST /:id/contact. Also drop rejectionReason (#506): it's admin-authored
  // moderation text and must never reach a public caller (a REJECTED-but-live
  // provider would otherwise leak it). It stays only on the owner-gated
  // dashboard. userId is the owner's identity (#655): it never ships to
  // anonymous or third-party callers — only re-added below when the caller is
  // the owner (their own id) or an admin. The map pin (#48) is included only
  // when set — unpinned profiles carry no coordinate keys.
  const {
    contactPhone,
    whatsapp,
    phone2,
    rejectionReason,
    contactEmail,
    userId,
    latitude,
    longitude,
    ...pub
  } = provider;
  const ownerOrAdmin = auth?.userId === userId || auth?.role === "ADMIN";
  // Admin-managed per-trade cover (#436/#701): the detail page banner uses the
  // category cover first, mirroring toCardDTO's `categoryImageUrl`.
  const catImages = await categoryImageMap();
  return c.json({
    provider: {
      ...pub,
      categoryImageUrl: catImages.get(provider.category) ?? null,
      ...(ownerOrAdmin ? { userId } : {}),
      ...(latitude !== null && longitude !== null ? { latitude, longitude } : {}),
      // price is DECIMAL in the DB (#371) — a Decimal JSON-serializes as a
      // string, so convert back to the number this payload has always carried.
      services: provider.services.map((s) => ({ ...s, price: moneyToNumber(s.price) })),
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
  const [{ reviews, nextCursor }, answered, catImages] = await Promise.all([
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
    // Admin-managed per-trade cover (#436/#701): the detail page banner uses the
    // category cover first, mirroring toCardDTO's `categoryImageUrl`.
    categoryImageMap(),
  ]);
  // Drop _count (internal), the raw phone columns (#64) and the contact email
  // (#655) — the profile page reveals the digits/address on demand via
  // POST /:id/contact — and rejectionReason (#506), which is admin-only
  // moderation text kept off every public payload. userId is the owner's
  // identity (#655): kept off anonymous/third-party payloads, re-added below
  // only for the owner (their own id, powering the profile's owner check) or an
  // admin. The map pin (#48) is included only when set.
  const {
    _count,
    contactPhone,
    whatsapp,
    phone2,
    rejectionReason,
    contactEmail,
    userId,
    latitude,
    longitude,
    ...providerFields
  } = provider;
  const ownerOrAdmin = auth?.userId === userId || auth?.role === "ADMIN";
  return c.json({
    provider: {
      ...providerFields,
      categoryImageUrl: catImages.get(provider.category) ?? null,
      ...(ownerOrAdmin ? { userId } : {}),
      ...(latitude !== null && longitude !== null ? { latitude, longitude } : {}),
      // price is DECIMAL in the DB (#371) — a Decimal JSON-serializes as a
      // string, so convert back to the number this payload has always carried.
      services: provider.services.map((s) => ({ ...s, price: moneyToNumber(s.price) })),
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
      // Denormalized aggregates (#748) — no rating fan-out for the OG card.
      ratingAvg: true,
      ratingCount: true,
    },
  });
  if (!provider) {
    return c.json({ error: "Provider not found" }, 404);
  }
  return c.json({
    name: provider.contactName,
    category: provider.category,
    city: provider.city,
    district: provider.district,
    suspended: provider.suspended,
    rating: provider.ratingCount > 0 ? provider.ratingAvg : null,
    reviewCount: provider.ratingCount,
    verificationStatus: provider.verificationStatus,
  });
});

// Contact reveal (#64/#655). The public detail/profile payloads omit the raw
// phone digits AND the email address; the web fetches them here on an explicit
// "show contact" action. It is a POST (not a GET) so the gateway's rate limiter
// — which only guards writes — throttles mass harvesting per IP without
// exposing every number/address in the initial HTML. Suspended profiles stay
// hidden (same gate as the detail routes); admins moderating a suspended
// profile still get through.
providersRoutes.post("/api/providers/:id/contact", async (c) => {
  const id = c.req.param("id");
  const provider = await db.provider.findUnique({
    where: { id },
    select: {
      contactPhone: true,
      whatsapp: true,
      phone2: true,
      contactEmail: true,
      suspended: true,
    },
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
    email: provider.contactEmail,
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

  // Verified-email gate (#115): a signed-in customer must confirm their email
  // before contacting a provider — the inquiry both notifies the provider and
  // permanently satisfies review-service's interaction gate, so a throwaway
  // unconfirmed account must not reach it. Anonymous inquiries (no session) are
  // deliberately still allowed, matching how job-post gates only signed-in
  // callers; the gate applies only when there IS an authenticated user. Fails
  // loudly on an identity outage (502) — never silently allow or block a gated
  // write, mirroring job-service's isEmailVerified check.
  if (auth) {
    let verified: boolean;
    try {
      verified = await isEmailVerified(auth.userId);
    } catch (e) {
      log.error("email-verification gate failed", { context: "inquiry", err: e });
      return c.json({ error: "Upstream service unavailable" }, 502);
    }
    if (!verified) {
      return c.json(
        { error: "Verify your email address to contact a provider" },
        403
      );
    }
  }

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
  // the inquiry. In-app + email flow through the notification event (#394);
  // the link lands on the new thread, not just the dashboard.
  await emitNotification({
    type: "NEW_INQUIRY",
    recipients: [
      { userId: provider.userId, email: provider.contactEmail, locale: getLocale(c) },
    ],
    payload: { customerName: parsed.data.name },
    link: `/dashboard/inquiries/${inquiry.id}`,
    origin: getOrigin(c),
  });

  return c.json({ inquiry });
});
