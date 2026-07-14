// Index-document ingestion: the full-document upsert provider-service pushes
// on every indexed write (and the reindex sweep replays in bulk), plus the
// rating-aggregate patch review-service pushes. Upserts are idempotent with
// last-write-wins on the source row's updatedAt, so replayed/out-of-order
// pushes can never regress the index.
import { z } from "zod";
import { db } from "../db";

// The document provider-service pushes (lib/search-index.ts there builds it —
// keep the shapes in lockstep). Rating aggregates are deliberately absent:
// review-service owns those and patches them separately, so a document push
// must never clobber them.
export const indexDocumentSchema = z.object({
  userId: z.string().min(1),
  contactName: z.string().min(1),
  category: z.string().min(1),
  headline: z.string().min(1),
  bio: z.string().min(1),
  headlineSi: z.string().nullish(),
  bioSi: z.string().nullish(),
  city: z.string().min(1),
  district: z.string().min(1),
  serviceDistricts: z.array(z.string().min(1)).max(25).default([]),
  serviceTitles: z.array(z.string().min(1)).max(100).default([]),
  // Whole LKR rupees (#371); DECIMAL columns accept plain numbers over JSON.
  servicePrices: z.array(z.number().nonnegative()).max(100).default([]),
  available: z.boolean(),
  awayUntil: z.coerce.date().nullish(),
  verificationStatus: z.string().min(1),
  experience: z.number().int().min(0),
  latitude: z.number().min(-90).max(90).nullish(),
  longitude: z.number().min(-180).max(180).nullish(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type IndexDocument = z.infer<typeof indexDocumentSchema>;

export const ratingPatchSchema = z.object({
  providerId: z.string().min(1),
  ratingAvg: z.number().min(0).max(5).nullable(),
  ratingCount: z.number().int().min(0),
});

export type RatingPatch = z.infer<typeof ratingPatchSchema>;

// Column values shared by the create and update branches of the upsert. The
// pin is a pair (#48): half a pair from a drifted caller stores as unpinned
// rather than a bogus point — the generated `location` column guards this too.
function toColumns(doc: IndexDocument) {
  const pinned = doc.latitude != null && doc.longitude != null;
  return {
    userId: doc.userId,
    contactName: doc.contactName,
    category: doc.category,
    headline: doc.headline,
    bio: doc.bio,
    headlineSi: doc.headlineSi ?? null,
    bioSi: doc.bioSi ?? null,
    city: doc.city,
    district: doc.district,
    serviceDistricts: doc.serviceDistricts,
    serviceTitles: doc.serviceTitles,
    servicePrices: doc.servicePrices,
    // Cheapest service = today's fromPrice (the price sort key).
    minPrice: doc.servicePrices.length > 0 ? Math.min(...doc.servicePrices) : null,
    available: doc.available,
    awayUntil: doc.awayUntil ?? null,
    verificationStatus: doc.verificationStatus,
    experience: doc.experience,
    latitude: pinned ? doc.latitude : null,
    longitude: pinned ? doc.longitude : null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

// Full-document upsert, last-write-wins on updatedAt: an UPDATE guarded by
// `updatedAt <= doc.updatedAt` (a stale push over a fresher row is a no-op),
// then an INSERT when no row existed. Rating aggregates are untouched on
// update and zeroed on create (review-service's patch fills them in).
export async function upsertDocument(
  providerId: string,
  doc: IndexDocument
): Promise<void> {
  const columns = toColumns(doc);
  const { count } = await db.providerIndex.updateMany({
    where: { providerId, updatedAt: { lte: doc.updatedAt } },
    data: columns,
  });
  if (count > 0) return;
  const existing = await db.providerIndex.findUnique({
    where: { providerId },
    select: { providerId: true },
  });
  if (existing) return; // fresher row already indexed — stale push dropped
  try {
    await db.providerIndex.create({
      data: { providerId, ...columns, ratingAvg: null, ratingCount: 0 },
    });
  } catch (e) {
    // A concurrent push won the insert race — its document is equally fresh
    // (full documents are idempotent), so losing is fine.
    if ((e as { code?: string }).code === "P2002") return;
    throw e;
  }
}

// Rating patch from review-service. updateMany so a patch that races ahead of
// the provider's first document push is a clean no-op (the reindex sweep — and
// the next review write — heal it). ratingAvg is normalized to null while the
// count is 0, preserving browse's "no reviews → null rating" semantics.
export async function patchRatings(patch: RatingPatch): Promise<void> {
  await db.providerIndex.updateMany({
    where: { providerId: patch.providerId },
    data: {
      ratingAvg: patch.ratingCount > 0 ? patch.ratingAvg : null,
      ratingCount: patch.ratingCount,
    },
  });
}

export async function deleteDocument(providerId: string): Promise<void> {
  await db.providerIndex.deleteMany({ where: { providerId } });
}
