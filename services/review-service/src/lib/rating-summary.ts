// DB access for the rating summaries (#528): overall average + count, the
// optional per-dimension averages and the 5→1 star histogram. The pure math
// lives in ./ratings; this module only runs the two grouped queries and hands
// the rows off to the aggregators.
import { db } from "../db";
import {
  buildRatingSummaries,
  emptyRatingSummary,
  type ProviderRatingSummary,
} from "./ratings";

// Full summaries for a set of providers in two grouped queries over
// non-deleted reviews: one for the averages + count, one for the per-star
// counts. Providers with no reviews are absent from the map — callers that
// need a value for every id default them (see fetchRatingSummary).
export async function fetchRatingSummaries(
  providerIds: string[]
): Promise<Record<string, ProviderRatingSummary>> {
  if (providerIds.length === 0) return {};
  const where = { providerId: { in: providerIds }, deletedAt: null };
  const [base, distribution] = await Promise.all([
    db.review.groupBy({
      by: ["providerId"],
      where,
      _avg: {
        rating: true,
        quality: true,
        punctuality: true,
        value: true,
        communication: true,
      },
      _count: { _all: true },
    }),
    db.review.groupBy({
      by: ["providerId", "rating"],
      where,
      _count: { _all: true },
    }),
  ]);
  return buildRatingSummaries(base, distribution);
}

// Single-provider convenience for the public reviews endpoint: always returns
// a summary, zero-filled when the provider has no reviews yet.
export async function fetchRatingSummary(
  providerId: string
): Promise<ProviderRatingSummary> {
  const summaries = await fetchRatingSummaries([providerId]);
  return summaries[providerId] ?? emptyRatingSummary();
}
