// Thin S2S clients for the peers this service reads from. The card hydration
// is the one read this service cannot degrade around (ids without display data
// are useless), so its caller returns 503 when it fails; everything else
// degrades gracefully per the shared conventions.
import { s2s } from "./http";
import { log } from "./log";

const PROVIDER_URL = process.env.PROVIDER_SERVICE_URL ?? "http://localhost:4002";
const REVIEW_URL = process.env.REVIEW_SERVICE_URL ?? "http://localhost:4003";

// The public card DTO, hydrated from provider-service so display data stays
// single-sourced (RFC §4.1). Opaque here — the search plane only overwrites
// the rating fields (owned by this index) and adds distanceKm.
export type ProviderCard = {
  id: string;
  rating: number | null;
  reviewCount: number;
  [key: string]: unknown;
};

// provider-service GET /internal/providers/cards?ids= → { cards }. Returns
// null on failure so the route can 503 rather than serve an empty page that
// looks like "no results".
export async function fetchCards(ids: string[]): Promise<ProviderCard[] | null> {
  if (ids.length === 0) return [];
  try {
    const res = await s2s(
      PROVIDER_URL,
      `/internal/providers/cards?ids=${encodeURIComponent(ids.join(","))}`
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { cards?: ProviderCard[] };
    return data.cards ?? null;
  } catch (e) {
    log.error("card hydration failed", { err: e });
    return null;
  }
}

// Category list for free-text label matching (#128), memoized in-process for
// 60s like provider-service's own slug validator. Degrades to [] — a label
// match is an additive OR-arm, so an outage only narrows free-text results.
type CategoryRow = { slug: string; labelEn: string; labelSi: string };

const CATEGORY_TTL_MS = 60_000;
let categoryCache: CategoryRow[] | null = null;
let categoryExpiresAt = 0;

async function categoryList(): Promise<CategoryRow[]> {
  const now = Date.now();
  if (categoryCache && categoryExpiresAt > now) return categoryCache;
  try {
    const res = await s2s(PROVIDER_URL, "/internal/categories");
    if (!res.ok) return categoryCache ?? [];
    const data = (await res.json()) as { categories?: CategoryRow[] };
    categoryCache = data.categories ?? [];
    categoryExpiresAt = now + CATEGORY_TTL_MS;
    return categoryCache;
  } catch {
    return categoryCache ?? [];
  }
}

// Tests only — drop the memoized list so a case starts from a cold cache.
export function __resetCategoryCache() {
  categoryCache = null;
  categoryExpiresAt = 0;
}

// Slugs whose EN or SI label contains the query (browse's category-label
// match, #128 — inactive categories included on purpose there and here).
export async function matchCategorySlugs(q: string): Promise<string[]> {
  const needle = q.trim().toLowerCase();
  if (!needle) return [];
  return (await categoryList())
    .filter(
      (c) =>
        c.labelEn.toLowerCase().includes(needle) ||
        c.labelSi.toLowerCase().includes(needle)
    )
    .map((c) => c.slug);
}

// ---- Reindex sweep feeds (RFC §4.2) ----

export type ExportedDocument = { id: string } & Record<string, unknown>;

// provider-service GET /internal/providers/export?cursor=&take= — the
// paginated full-document enumerate the sweep walks. Throws on failure: the
// sweep must fail loudly rather than treat an outage as "no providers" and
// wipe the index.
export async function fetchExportPage(
  cursor: string | null,
  take: number
): Promise<{ providers: ExportedDocument[]; nextCursor: string | null }> {
  const qs = new URLSearchParams({ take: String(take) });
  if (cursor) qs.set("cursor", cursor);
  const res = await s2s(PROVIDER_URL, `/internal/providers/export?${qs.toString()}`);
  if (!res.ok) {
    throw new Error(`provider export failed: ${res.status}`);
  }
  const data = (await res.json()) as {
    providers?: ExportedDocument[];
    nextCursor?: string | null;
  };
  return { providers: data.providers ?? [], nextCursor: data.nextCursor ?? null };
}

export type RatingEntry = { rating: number; count: number };

// review-service GET /internal/ratings?providerIds= (the existing batch).
// Throws on failure — the sweep retries next run rather than zeroing ratings.
export async function fetchRatings(
  providerIds: string[]
): Promise<Record<string, RatingEntry>> {
  if (providerIds.length === 0) return {};
  const res = await s2s(
    REVIEW_URL,
    `/internal/ratings?providerIds=${encodeURIComponent(providerIds.join(","))}`
  );
  if (!res.ok) {
    throw new Error(`ratings fetch failed: ${res.status}`);
  }
  const data = (await res.json()) as { ratings?: Record<string, RatingEntry> };
  return data.ratings ?? {};
}
