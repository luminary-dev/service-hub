// Full-reindex sweep (RFC §4.2 self-heal): walk provider-service's paginated
// export, upsert every document (the same last-write-wins upsert the push path
// uses), refresh rating aggregates from review-service's existing batch
// endpoint, then delete index rows absent from the export — suspended/erased
// providers drop out here even if their push was lost. Ops-cron triggered
// daily like sweep-orphans (docs/OPERATIONS.md).
import { randomUUID } from "node:crypto";
import { db } from "../db";
import { fetchExportPage, fetchRatings } from "./clients";
import { indexDocumentSchema, patchRatings, upsertDocument } from "./documents";
import { log } from "./log";

const EXPORT_PAGE_SIZE = 200;
// Hard ceiling on pages walked (200k providers) so a buggy/hostile cursor can
// never loop the sweep forever.
const MAX_PAGES = 1000;
const RATINGS_CHUNK = 200;

export type ReindexResult = {
  indexed: number;
  skipped: number;
  deleted: number;
  purged: number;
};

export async function runReindex(): Promise<ReindexResult> {
  // Sweep generation (#752): a unique id stamped onto every row this run
  // upserts, and the wall-clock start captured before the first export page.
  // The prune below deletes only rows this run did not stamp AND that predate
  // the sweep, so a provider registered mid-sweep is never pruned.
  const sweepId = randomUUID();
  const sweepStartedAt = new Date();
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
      await upsertDocument(id, parsed.data, sweepId);
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

  // Drift removal by sweep generation (#752): delete only rows this sweep did
  // not stamp (a different or absent sweepId) AND that predate it — a provider
  // registered mid-sweep carries a fresh updatedAt and survives. Anything the
  // source no longer exports (suspended, erased) still has its old timestamp
  // and drops out here. An empty export legitimately empties the index. The
  // explicit `sweepId: null` arm covers rows created by a push before their
  // first sweep, whichever way Prisma treats NULL under `not`.
  const { count: deleted } = await db.providerIndex.deleteMany({
    where: {
      updatedAt: { lt: sweepStartedAt },
      OR: [{ sweepId: { not: sweepId } }, { sweepId: null }],
    },
  });

  // Purge tombstones the sweep has made redundant (#752): once a tombstone
  // predates this sweep, the sweep has already re-pruned any row a stale push
  // may have resurrected before it, so the tombstone no longer protects
  // anything and can be dropped.
  const { count: purged } = await db.providerTombstone.deleteMany({
    where: { deletedAt: { lt: sweepStartedAt } },
  });

  return { indexed: seen.length, skipped, deleted, purged };
}
