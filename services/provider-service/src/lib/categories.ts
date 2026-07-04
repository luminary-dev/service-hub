// Dynamic category validation (#135/#60). Categories live in provider-service's
// Category table; the slug set is cached in-process for 60s so hot write paths
// don't pay a lookup per request. Read-path degradation: if the lookup fails
// (or returns nothing — an unseeded table must not reject every write), we fall
// back to the static CATEGORIES list from constants.ts.
//
// Inactive categories still validate: deactivation only hides a category from
// the public list — existing providers keep their slug, including on profile
// saves.
//
// The factory (createCategoryValidator) is a canonical shared module — the
// identity-, provider- and job-service copies stay in lockstep (only the
// default fetcher wiring below differs per service).
import { CATEGORIES } from "./constants";
import { log } from "./log";

export type SlugFetcher = () => Promise<string[]>;

const TTL_MS = 60_000;

export function createCategoryValidator(fetchSlugs: SlugFetcher, ttlMs = TTL_MS) {
  let cached: Set<string> | null = null;
  let expiresAt = 0;

  async function slugSet(): Promise<Set<string>> {
    const now = Date.now();
    if (cached && expiresAt > now) return cached;
    try {
      const slugs = await fetchSlugs();
      if (slugs.length === 0) {
        // Empty means "no data", not "nothing is valid" — treat like a failure.
        throw new Error("category lookup returned no categories");
      }
      cached = new Set(slugs);
      expiresAt = now + ttlMs;
      return cached;
    } catch (e) {
      log.error("lookup failed — using static fallback", { context: "categories", err: e });
      // Keep serving a stale cache if we have one; otherwise the static list.
      return cached ?? new Set(CATEGORIES);
    }
  }

  return {
    async isValidCategory(slug: string): Promise<boolean> {
      return (await slugSet()).has(slug);
    },
    // Tests only — the cache is per-validator instance.
    clearCache() {
      cached = null;
      expiresAt = 0;
    },
  };
}

// Default instance: provider-service owns the table, so it reads its own DB.
// The db import is lazy so unit tests of the factory never construct a client.
export const categoryValidator = createCategoryValidator(async () => {
  const { db } = await import("../db.js");
  const rows = await db.category.findMany({ select: { slug: true } });
  return rows.map((r) => r.slug);
});
