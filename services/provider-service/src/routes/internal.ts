// Internal endpoints for sibling services (already behind the internal-secret
// middleware). Never routed by the gateway.
import { Hono } from "hono";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "../db";
import { moderateContent } from "../lib/auto-report";
import {
  geoPairState,
  latitudeField,
  longitudeField,
  normalizeServiceDistricts,
  optionalWebUrl,
  serviceDistrictsField,
} from "../lib/field-rules";
import { getOrigin } from "../lib/http";
import { notifySavedSearchMatches } from "../lib/saved-search-alerts";
import {
  buildIndexDocument,
  deleteProviderIndexWithRetry,
  INDEX_SERVICE_SELECT,
  syncProviderIndex,
  syncProviderIndexByUser,
} from "../lib/search-index";
import { removeStoredFile, sweepMedia } from "../lib/storage";
import { cardInclude, categoryImageMap, toCardDTO } from "./providers";

export const internalRoutes = new Hono();

// Bound on how many ids a batch lookup will accept, so a caller (or attacker)
// can't force a single giant IN (...) clause. Comfortably above realistic
// favorite / job-response fan-out.
const MAX_BATCH_IDS = 500;

const optionalText = (max: number) =>
  z.string().max(max).optional().or(z.literal("")).nullish();

// Social/website links carry a URL, so they must go through the same scheme
// validator/normalizer as the profile-EDIT path (provider.ts) rather than a
// plain length check (#518) — otherwise this S2S create path would persist a
// `javascript:`/`data:` value that later renders as a live link. `.nullable()`
// because identity-service sends explicit `null` for an omitted field.
const optionalWebUrlOrNull = optionalWebUrl.nullable();

const createSchema = z.object({
  userId: z.string().min(1),
  name: z.string().min(1).max(80),
  email: z.string().min(1),
  phone: z.string().max(15).nullish(),
  category: z.string().min(1),
  headline: z.string().min(1).max(120),
  bio: z.string().min(1).max(2000),
  // Optional Sinhala variants (#515) — same length rules as the English
  // originals; empty/absent stores null.
  headlineSi: optionalText(120),
  bioSi: optionalText(2000),
  district: z.string().min(1),
  // Multi-district service area (#502). Optional so older callers keep
  // working; the create below always persists at least [district].
  serviceDistricts: serviceDistrictsField.nullish(),
  city: z.string().min(1).max(60),
  // Optional map pin (#48, geo-capture phase of the search RFC). Bounds are
  // re-checked here so a drifted caller can't persist an off-island point;
  // identity-service pre-validates the pair, so the geoPairState 400 below
  // only catches a drifted/hostile caller.
  latitude: latitudeField,
  longitude: longitudeField,
  experience: z.number().int().min(0).max(60),
  whatsapp: optionalText(15),
  phone2: optionalText(15),
  facebook: optionalWebUrlOrNull,
  instagram: optionalWebUrlOrNull,
  tiktok: optionalWebUrlOrNull,
  youtube: optionalWebUrlOrNull,
  website: optionalWebUrlOrNull,
  services: z
    .array(
      z.object({
        title: z.string().min(2).max(100),
        description: z.string().max(500).optional(),
        // Whole LKR rupees (#371) — identity-service already validates with
        // priceRupees before forwarding; enforcing .int() here keeps a float
        // from ever entering the DECIMAL(12,2) column over S2S.
        price: z.number().int().positive(),
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

  // Served set (#502): dedupe and pin the primary district; refuse (never
  // truncate) a union over the cap. identity-service pre-validates this, so a
  // 400 here only catches a drifted/hostile caller.
  const serviceDistricts = normalizeServiceDistricts(
    data.district,
    data.serviceDistricts ?? undefined
  );
  if (!serviceDistricts) {
    return c.json({ error: "Invalid input" }, 400);
  }

  // Map pin (#48): the coordinates are a pair — refuse a lone latitude (or a
  // number/null mix) rather than persisting half a location.
  if (geoPairState(data.latitude, data.longitude) === "invalid") {
    return c.json({ error: "Invalid input" }, 400);
  }

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
        headlineSi: data.headlineSi || null,
        bioSi: data.bioSi || null,
        district: data.district,
        serviceDistricts,
        city: data.city,
        latitude: data.latitude ?? null,
        longitude: data.longitude ?? null,
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
    // Content filter (#375): AFTER the write on purpose — the profile stays
    // visible and a filter hit only queues a SYSTEM report for admin triage.
    await moderateContent("PROVIDER", provider.id, {
      headline: data.headline,
      bio: data.bio,
      headlineSi: data.headlineSi,
      bioSi: data.bioSi,
      services: data.services
        .map((s) => `${s.title} ${s.description ?? ""}`)
        .join("\n"),
    });
    // Saved-search alerting (#516): email customers whose saved search matches
    // this newly published profile. Deliberately NOT awaited — this create sits
    // on identity's registration critical path (5s s2s budget, with user
    // rollback on timeout), so the fan-out runs after the response; it catches
    // and logs its own failures.
    void notifySavedSearchMatches(
      {
        id: provider.id,
        userId: data.userId,
        contactName: data.name,
        category: data.category,
        district: data.district,
        // Full served set (#502) — a saved search for any served district
        // matches, not only the base one.
        serviceDistricts,
      },
      getOrigin(c)
    );
    // Search-index push (search RFC §4.2): same fire-and-forget pattern as the
    // alert fan-out above — never on the registration critical path.
    void syncProviderIndex(provider.id);
    return c.json({ id: provider.id });
  } catch (e) {
    // userId is unique: a retried/concurrent registration for the same user
    // must be idempotent, not an unhandled 500. Return the existing id WITHOUT
    // touching `suspended` — clearing it here could silently lift an admin
    // suspension if a re-registration ever raced through this path.
    // Un-suspension is owned solely by the dedicated /reactivate endpoint
    // below (which itself refuses ADMIN suspensions, #550), keeping the
    // invariant "re-registration must never lift an ADMIN suspension" intact
    // even if this create path is reached.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const existing = await db.provider.findUnique({
        where: { userId: data.userId },
        select: { id: true },
      });
      if (existing) {
        return c.json({ id: existing.id });
      }
    }
    throw e;
  }
});

// Self-service downgrade (#403): a provider closing their own profile. Hides
// it from every public listing (the `suspended` flag the admin path already
// uses; `adminSuspended` is deliberately untouched so an active ADMIN
// suspension survives the downgrade, #550). Idempotent — a missing profile is
// a no-op { ok: true } so identity's role flip can proceed. Reversible:
// becoming a provider again unsuspends it via the /reactivate endpoint below.
internalRoutes.post("/internal/providers/by-user/:userId/deactivate", async (c) => {
  const userId = c.req.param("userId");
  const provider = await db.provider.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (!provider) return c.json({ ok: true, deactivated: false });
  await db.provider.update({
    where: { id: provider.id },
    data: { suspended: true },
  });
  // Suspended rows are DELETED from the search index (never flagged), so a
  // hidden profile can't leak through /api/search — the sync sees the
  // committed suspended row and issues the delete. Best-effort (RFC §4.2).
  void syncProviderIndex(provider.id);
  return c.json({ ok: true, deactivated: true });
});

// Reactivate a self-deactivated profile (#403 re-upgrade). complete-provider
// reuses an existing profile via getProviderIdByUser and never hits the create
// path, so becoming a provider again must explicitly clear `suspended` here.
// Idempotent — a missing or already-active profile is a no-op { ok: true }.
// An ADMIN suspension is refused (409, #550): only the admin unsuspend action
// may clear it, otherwise leave-provider → complete-provider would let a
// suspended provider lift their own moderation suspension.
internalRoutes.post("/internal/providers/by-user/:userId/reactivate", async (c) => {
  const userId = c.req.param("userId");
  const provider = await db.provider.findUnique({
    where: { userId },
    select: { id: true, suspended: true, adminSuspended: true },
  });
  if (!provider) return c.json({ ok: true, reactivated: false });
  if (provider.adminSuspended) {
    return c.json({ error: "Suspended by admin" }, 409);
  }
  if (provider.suspended) {
    await db.provider.update({
      where: { id: provider.id },
      data: { suspended: false },
    });
    // Back into the search index (best-effort, RFC §4.2).
    void syncProviderIndex(provider.id);
  }
  return c.json({ ok: true, reactivated: true });
});

// Login / job-board gate: the provider owned by a user, if any. `suspended` is
// selected so the job board / response gate can reject a suspended provider
// (#642) — a hidden profile keeps its role but must lose board access.
internalRoutes.get("/internal/providers/by-user/:userId", async (c) => {
  const userId = c.req.param("userId");
  const provider = await db.provider.findUnique({
    where: { userId },
    select: {
      id: true,
      userId: true,
      category: true,
      district: true,
      serviceDistricts: true,
      contactName: true,
      suspended: true,
    },
  });
  return c.json({ provider: provider ?? null });
});

// Denormalized avatar sync from identity (#434). Sets Provider.avatarUrl for
// the user (no-op/200 if they have no provider profile), so public cards/
// profile stay in step with User.avatarUrl. Always 200 — the caller's update
// already succeeded; this is a best-effort mirror.
internalRoutes.post("/internal/providers/avatar", async (c) => {
  const body = (await c.req.json().catch(() => null)) as {
    userId?: string;
    avatarUrl?: string | null;
  } | null;
  if (!body?.userId) {
    return c.json({ error: "userId required" }, 400);
  }
  await db.provider.updateMany({
    where: { userId: body.userId },
    data: { avatarUrl: body.avatarUrl ?? null },
  });
  return c.json({ ok: true });
});

// Denormalized contact sync from identity (#553). Mirrors User name/phone/
// email changes onto the provider's cached contact columns — the ones that
// drive public cards, admin lists, contact reveal and the inquiry / new-job
// lead emails. Only fields present in the body are written; matches suspended
// profiles too so a hidden profile is fresh if reactivated. Always 200 — the
// caller's own update already succeeded; this is a best-effort mirror like
// the avatar sync above.
const contactSyncSchema = z.object({
  userId: z.string().min(1),
  name: z.string().min(1).max(80).optional(),
  email: z.string().min(1).optional(),
  phone: z.string().max(15).nullish(),
});

internalRoutes.post("/internal/providers/contact", async (c) => {
  const parsed = contactSyncSchema.safeParse(
    await c.req.json().catch(() => null)
  );
  if (!parsed.success) {
    return c.json({ error: "Invalid input" }, 400);
  }
  const { name, email, phone } = parsed.data;
  const data: Prisma.ProviderUpdateManyMutationInput = {};
  if (name !== undefined) data.contactName = name;
  if (email !== undefined) data.contactEmail = email;
  if (phone !== undefined) data.contactPhone = phone || null;
  if (Object.keys(data).length > 0) {
    await db.provider.updateMany({
      where: { userId: parsed.data.userId },
      data,
    });
    // contactName is indexed for free-text search — mirror a name change into
    // the search index too (best-effort; email/phone aren't indexed but the
    // full-document push is idempotent either way).
    if (data.contactName !== undefined) {
      void syncProviderIndexByUser(parsed.data.userId);
    }
  }
  return c.json({ ok: true });
});

// Forward lead-gen fan-out (#501): the providers to notify when a customer
// posts a job. Mirrors the job board's scoping exactly — a provider matches a
// job when its `category` equals the job's, its served set (`serviceDistricts`,
// #502) contains the job's district, AND it is not suspended (the same
// `suspended: false` gate browse applies; verification and
// availability are display concerns the board itself doesn't filter on). So the
// set emailed about a new job is precisely the set that would see it on their
// board. `excludeUserId` drops the poster if they happen to also be a provider,
// mirroring the board's not-own-job rule. Returns each match's `userId` (the
// in-app notification recipient) plus the denormalized `contactEmail` — the
// same address recorded at registration and the canonical provider contact
// (customer emails live in identity, but provider emails live here). Capped
// and deduped by email so no provider is alerted twice.
const MAX_MATCHING_PROVIDERS = 200;

internalRoutes.get("/internal/providers/matching", async (c) => {
  const category = c.req.query("category");
  const district = c.req.query("district");
  if (!category || !district) {
    return c.json({ error: "category and district are required" }, 400);
  }
  const excludeUserId = c.req.query("excludeUserId");
  const matches = await db.provider.findMany({
    where: {
      category,
      serviceDistricts: { has: district },
      suspended: false,
      ...(excludeUserId ? { NOT: { userId: excludeUserId } } : {}),
    },
    select: { id: true, userId: true, contactName: true, contactEmail: true },
    take: MAX_MATCHING_PROVIDERS,
  });
  // Dedupe by contact email — two profiles could share an address; a provider
  // must never get two copies of the same new-job alert.
  const seen = new Set<string>();
  const providers = matches.filter((p) => {
    const email = p.contactEmail.toLowerCase();
    if (seen.has(email)) return false;
    seen.add(email);
    return true;
  });
  return c.json({ providers });
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

// Card hydration for the search-service query plane (search RFC §4.1): the
// SAME card DTO the public browse builds (services/photos includes, category
// cover fallback), batched by ids. Rating fields come back null/0 here —
// search-service overlays its own denormalized aggregates (it already ranks
// on them). Suspended providers are excluded (defense in depth; they are also
// deleted from the index). Order is not meaningful — the caller re-orders by
// its ranked ids.
internalRoutes.get("/internal/providers/cards", async (c) => {
  const ids = (c.req.query("ids") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, MAX_BATCH_IDS);
  const rows = ids.length
    ? await db.provider.findMany({
        where: { id: { in: ids }, suspended: false },
        include: cardInclude,
      })
    : [];
  const catImages = await categoryImageMap();
  const cards = rows.map((p) => toCardDTO(p, undefined, catImages));
  return c.json({ cards });
});

// Reindex export for the search-service sweep (search RFC §4.2): every
// non-suspended provider as a full index document (the exact shape the push
// path PUTs — lib/search-index.ts), id-cursor paginated. The sweep upserts
// everything returned and deletes index rows absent from the walk, so
// suspended/erased providers age out even when their push was lost.
const EXPORT_DEFAULT_TAKE = 100;
const EXPORT_MAX_TAKE = 500;

internalRoutes.get("/internal/providers/export", async (c) => {
  const rawTake = Math.floor(Number(c.req.query("take")));
  const take =
    Number.isFinite(rawTake) && rawTake >= 1
      ? Math.min(rawTake, EXPORT_MAX_TAKE)
      : EXPORT_DEFAULT_TAKE;
  const cursor = c.req.query("cursor") || undefined;
  const rows = await db.provider.findMany({
    where: { suspended: false },
    include: { services: { select: INDEX_SERVICE_SELECT } },
    orderBy: { id: "asc" },
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    take: take + 1,
  });
  const hasMore = rows.length > take;
  if (hasMore) rows.length = take;
  const providers = rows.map((p) => ({ id: p.id, ...buildIndexDocument(p) }));
  return c.json({
    providers,
    nextCursor: hasMore ? rows[rows.length - 1]!.id : null,
  });
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
// VerificationDocument rows cascade) plus its stored upload files
// (best-effort), and the Inquiry rows this user sent to other providers.
//
// Erasing a PROVIDER no longer destroys the inquiries it *received* (#650,
// PDPA): those carry the CUSTOMER's name/phone/email/message + thread — their
// own data — so the Inquiry→Provider FK is ON DELETE SET NULL (not CASCADE).
// Deleting the Provider row detaches its received inquiries (providerId → null)
// instead of deleting them; the customer keeps their history while the
// departed provider's identifying PII goes with the row. Inquiries this user
// *sent* as a customer are still deleted below (their own data).
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
    // The row is gone, so the read-back sync can't run — delete the index
    // document directly. Erasure is a compliance op, so this is AWAITED with a
    // bounded retry (#640) rather than fire-and-forget; the daily reindex sweep
    // is still the final backstop for a survivor.
    await deleteProviderIndexWithRetry(provider.id);
    for (const f of [
      ...provider.photos.map((p) => p.url),
      ...provider.verificationDocs.map((d) => d.url),
      ...(provider.avatarUrl ? [provider.avatarUrl] : []),
      ...(provider.coverPhoto ? [provider.coverPhoto] : []),
    ]) {
      await removeStoredFile(f);
    }
  }

  // Inquiries this user sent to other providers (anonymous ones carry no
  // userId and are untouched by design).
  await db.inquiry.deleteMany({ where: { userId } });

  return c.json({ ok: true });
});

// Page size for the orphan-sweep table walks (#639).
const SWEEP_PAGE_SIZE = 500;

// Walk a table in cursor-ordered pages, folding each row's stored-file URL into
// `sink`. Bounds per-query size so no single findMany loads a whole media table
// at once (#639); the referenced Set is still the sweep's full keep-list (that
// is unavoidable — sweepMedia deletes any stored object absent from it), but the
// DB round-trips now stream page by page. Rows carry an opaque `cursor` (the
// table's PK) used to page past the last row seen.
async function collectReferencedUrls(
  sink: Set<string>,
  fetchPage: (
    cursor: string | undefined
  ) => Promise<{ cursor: string; url: string | null }[]>
): Promise<void> {
  let cursor: string | undefined;
  for (;;) {
    const rows = await fetchPage(cursor);
    for (const r of rows) if (r.url) sink.add(r.url);
    if (rows.length < SWEEP_PAGE_SIZE) break;
    cursor = rows[rows.length - 1]!.cursor;
  }
}

// Periodic maintenance (#36): remove stored upload files no database row
// references any more. Grace window protects in-flight uploads; run it from
// ops tooling (cron/curl with the internal secret).
internalRoutes.post("/internal/maintenance/sweep-orphans", async (c) => {
  // Provider-namespace keep-list, streamed in id-ordered pages (#639).
  const referenced = new Set<string>();
  await collectReferencedUrls(referenced, (cursor) =>
    db.workPhoto
      .findMany({
        select: { id: true, url: true },
        orderBy: { id: "asc" },
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        take: SWEEP_PAGE_SIZE,
      })
      .then((rows) => rows.map((r) => ({ cursor: r.id, url: r.url })))
  );
  await collectReferencedUrls(referenced, (cursor) =>
    db.verificationDocument
      .findMany({
        select: { id: true, url: true },
        orderBy: { id: "asc" },
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        take: SWEEP_PAGE_SIZE,
      })
      .then((rows) => rows.map((r) => ({ cursor: r.id, url: r.url })))
  );
  await collectReferencedUrls(referenced, (cursor) =>
    db.provider
      .findMany({
        where: { avatarUrl: { not: null } },
        select: { id: true, avatarUrl: true },
        orderBy: { id: "asc" },
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        take: SWEEP_PAGE_SIZE,
      })
      .then((rows) => rows.map((r) => ({ cursor: r.id, url: r.avatarUrl })))
  );
  await collectReferencedUrls(referenced, (cursor) =>
    db.provider
      .findMany({
        where: { coverPhoto: { not: null } },
        select: { id: true, coverPhoto: true },
        orderBy: { id: "asc" },
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        take: SWEEP_PAGE_SIZE,
      })
      .then((rows) => rows.map((r) => ({ cursor: r.id, url: r.coverPhoto })))
  );
  const provider = await sweepMedia("provider", [...referenced]);

  // Category cover images (#436) live in their own namespace; sweep it against
  // the saved imageUrls so an abandoned or replaced admin upload doesn't
  // orphan the object forever (#555). Paginated by `slug` (the Category PK).
  const categoryReferenced = new Set<string>();
  await collectReferencedUrls(categoryReferenced, (cursor) =>
    db.category
      .findMany({
        where: { imageUrl: { not: null } },
        select: { slug: true, imageUrl: true },
        orderBy: { slug: "asc" },
        ...(cursor ? { cursor: { slug: cursor }, skip: 1 } : {}),
        take: SWEEP_PAGE_SIZE,
      })
      .then((rows) => rows.map((r) => ({ cursor: r.slug, url: r.imageUrl })))
  );
  const category = await sweepMedia("category", [...categoryReferenced]);
  return c.json({
    scanned: provider.scanned + category.scanned,
    removed: provider.removed + category.removed,
  });
});

// Existence/suspended check (favorites, reviews). Always 200 — the caller
// decides its own 404 semantics. `contactEmail` lets review-service address
// the owner's new-review notification without a second lookup (#393).
internalRoutes.get("/internal/providers/:id/summary", async (c) => {
  const id = c.req.param("id");
  const provider = await db.provider.findUnique({
    where: { id },
    select: { id: true, userId: true, suspended: true, contactEmail: true },
  });
  return c.json({ provider: provider ?? null });
});
