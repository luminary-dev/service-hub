// Full-reindex sweep (RFC §4.2 self-heal): walk provider-service's paginated
// export, upsert every document (the same last-write-wins upsert the push path
// uses), refresh rating aggregates from review-service's existing batch
// endpoint, then delete index rows absent from the export — suspended/erased
// providers drop out here even if their push was lost. Ops-cron triggered
// daily like sweep-orphans (docs/OPERATIONS.md).
import { db } from "../db";
import { fetchExportPage, fetchRatings } from "./clients";
import { indexDocumentSchema, patchRatings, upsertDocument } from "./documents";
import { log } from "./log";

const EXPORT_PAGE_SIZE = 200;
// Hard ceiling on pages walked (200k providers) so a buggy/hostile cursor can
// never loop the sweep forever.
const MAX_PAGES = 1000;
const RATINGS_CHUNK = 200;

export type ReindexResult = { indexed: number; skipped: number; deleted: number };

export async function runReindex(): Promise<ReindexResult> {
  const seen: string[] = [];
  let skipped = 0;
  let cursor: string | null = null;
  for (let pageNo = 0; ; pageNo++) {
    if (pageNo >= MAX_PAGES) {
      throw new Error(`reindex exceeded ${MAX_PAGES} export pages — aborting`);
    }
    const page = await fetchExportPage(cursor, EXPORT_PAGE_SIZE);
    for (const raw of page.providers) {
      const { id, ...docFields } = raw;
      const parsed = indexDocumentSchema.safeParse(docFields);
      if (!id || typeof id !== "string" || !parsed.success) {
        // One malformed row must not abort the sweep — log and continue; the
        // row keeps its previous index state (or stays absent).
        skipped++;
        log.warn("reindex skipped a malformed export row", { id });
        continue;
      }
      await upsertDocument(id, parsed.data);
      seen.push(id);
    }
    cursor = page.nextCursor;
    if (!cursor) break;
  }

  // Rating aggregates for everything just indexed. Providers absent from the
  // ratings map genuinely have no reviews → null/0.
  for (let i = 0; i < seen.length; i += RATINGS_CHUNK) {
    const chunk = seen.slice(i, i + RATINGS_CHUNK);
    const ratings = await fetchRatings(chunk);
    for (const providerId of chunk) {
      const r = ratings[providerId];
      await patchRatings({
        providerId,
        ratingAvg: r?.rating ?? null,
        ratingCount: r?.count ?? 0,
      });
    }
  }

  // Drift removal: anything the source no longer exports (suspended, erased)
  // leaves the index. An empty export legitimately empties the index.
  const { count: deleted } = await db.providerIndex.deleteMany({
    where: { providerId: { notIn: seen } },
  });

  return { indexed: seen.length, skipped, deleted };
}
