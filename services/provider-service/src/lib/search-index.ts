// Search-index sync (search & discovery RFC §4.2): push the full index
// document to search-service from every write that changes an indexed field —
// the #434 avatar-mirror / #516 alert pattern. Entirely best-effort and
// fire-and-forget (`void syncProviderIndex(...)` at the call sites): the
// caller's own write already committed, so every failure here is logged and
// swallowed, never surfaced. A dropped push is bounded by the daily reindex
// sweep (search-service POST /internal/search/reindex), which replays the
// /internal/providers/export feed built from the same document shape.
import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { s2s } from "./http";
import { log } from "./log";
import { moneyToNumber } from "./money";

const SEARCH_URL = process.env.SEARCH_SERVICE_URL ?? "http://localhost:4008";

// Structural view of the Provider row (+ its services) the document reads —
// the sync path passes a full Prisma payload; the type stays a Pick so tests
// and the export route don't have to fabricate unrelated columns.
type IndexSource = Pick<
  Prisma.ProviderGetPayload<Record<string, never>>,
  | "userId"
  | "contactName"
  | "category"
  | "headline"
  | "bio"
  | "headlineSi"
  | "bioSi"
  | "city"
  | "district"
  | "serviceDistricts"
  | "available"
  | "awayUntil"
  | "verificationStatus"
  | "experience"
  | "latitude"
  | "longitude"
  | "createdAt"
  | "updatedAt"
> & { services: { title: string; price: Prisma.Decimal | number }[] };

export const INDEX_SERVICE_SELECT = { title: true, price: true } as const;

// The full document search-service upserts (its lib/documents.ts schema —
// keep the shapes in lockstep). Public card/search data only: no contact PII
// beyond the display name, no phone/email, no moderation fields. Rating
// aggregates are deliberately absent — review-service owns those and pushes
// them separately.
export function buildIndexDocument(p: IndexSource) {
  return {
    userId: p.userId,
    contactName: p.contactName,
    category: p.category,
    headline: p.headline,
    bio: p.bio,
    headlineSi: p.headlineSi,
    bioSi: p.bioSi,
    city: p.city,
    district: p.district,
    serviceDistricts: p.serviceDistricts,
    serviceTitles: p.services.map((s) => s.title),
    // Decimal → number at the JSON edge (#371), like every other payload.
    servicePrices: p.services.map((s) => moneyToNumber(s.price)),
    available: p.available,
    awayUntil: p.awayUntil,
    verificationStatus: p.verificationStatus,
    experience: p.experience,
    latitude: p.latitude,
    longitude: p.longitude,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

// Re-read the committed row and push (or, for a suspended/missing row, delete
// — the index only ever holds publicly visible providers). Reading back
// instead of threading the row through every call site keeps the push
// identical to what the reindex export would produce.
export async function syncProviderIndex(providerId: string): Promise<void> {
  try {
    const provider = await db.provider.findUnique({
      where: { id: providerId },
      include: { services: { select: INDEX_SERVICE_SELECT } },
    });
    if (!provider || provider.suspended) {
      await deleteFromIndex(providerId);
      return;
    }
    const res = await s2s(SEARCH_URL, `/internal/search/providers/${providerId}`, {
      method: "PUT",
      body: JSON.stringify(buildIndexDocument(provider)),
    });
    if (!res.ok) {
      throw new Error(`search index push failed: ${res.status}`);
    }
  } catch (e) {
    log.error("search index sync failed", {
      context: "search-index",
      providerId,
      err: e,
    });
  }
}

// For writes keyed by user (the identity contact mirror). No provider → no-op.
export async function syncProviderIndexByUser(userId: string): Promise<void> {
  try {
    const provider = await db.provider.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (provider) await syncProviderIndex(provider.id);
  } catch (e) {
    log.error("search index sync failed", { context: "search-index", userId, err: e });
  }
}

// For writes where the row is already gone (account erasure) — the read-back
// in syncProviderIndex would also delete, but the id must be captured before
// the delete commits, so erase calls this directly.
export async function deleteProviderIndex(providerId: string): Promise<void> {
  try {
    await deleteFromIndex(providerId);
  } catch (e) {
    log.error("search index delete failed", {
      context: "search-index",
      providerId,
      err: e,
    });
  }
}

// Erasure variant (#640): account deletion is a compliance op, so the index
// delete gets a single bounded retry with jitter — the same shape s2s applies
// to idempotent reads, which it can't apply to a DELETE itself. Meant to be
// AWAITED on the erase path (not fired-and-forgotten): a lone transient blip no
// longer silently strands a public index document for a user who asked to be
// erased. Still best-effort at the very end — the Provider row is already gone
// and can't be rolled back, and the daily reindex sweep prunes any survivor —
// so a final failure is logged, never thrown.
export async function deleteProviderIndexWithRetry(
  providerId: string
): Promise<void> {
  try {
    await deleteFromIndex(providerId);
    return;
  } catch (e) {
    log.warn("search index delete failed — retrying once (erase)", {
      context: "search-index",
      providerId,
      err: e,
    });
  }
  await new Promise((r) => setTimeout(r, 100 + Math.floor(Math.random() * 150)));
  try {
    await deleteFromIndex(providerId);
  } catch (e) {
    log.error("search index delete failed after retry (erase)", {
      context: "search-index",
      providerId,
      err: e,
    });
  }
}

async function deleteFromIndex(providerId: string): Promise<void> {
  const res = await s2s(SEARCH_URL, `/internal/search/providers/${providerId}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    throw new Error(`search index delete failed: ${res.status}`);
  }
}
