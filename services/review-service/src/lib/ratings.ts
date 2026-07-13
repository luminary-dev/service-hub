// Pure aggregation over Prisma `review.groupBy` rows — kept side-effect free
// so the math is unit-testable without a database.
import { REVIEW_DIMENSIONS, type ReviewDimension } from "./validation";

export type RatingGroupRow = {
  providerId: string;
  // The overall-rating groupBy also averages the optional dimensions in one
  // pass (#528); the extra keys are ignored by `aggregateRatings`.
  _avg: {
    rating: number | null;
    quality?: number | null;
    punctuality?: number | null;
    value?: number | null;
    communication?: number | null;
  };
  _count: { _all: number };
};

export type RatingSummary = { rating: number; count: number };

// { [providerId]: { rating: <average, not rounded>, count } }
export function aggregateRatings(rows: RatingGroupRow[]): Record<string, RatingSummary> {
  const ratings: Record<string, RatingSummary> = {};
  for (const row of rows) {
    ratings[row.providerId] = {
      rating: row._avg.rating ?? 0,
      count: row._count._all,
    };
  }
  return ratings;
}

// Per-dimension averages (#528), each over its non-null values only (Prisma's
// _avg already skips nulls) or null when no reviewer scored that dimension.
export type DimensionAverages = Record<ReviewDimension, number | null>;

// Overall-rating histogram — one bucket per star, always all five present so
// the UI can render a stable 5→1 bar chart even for unused stars.
export type RatingDistribution = Record<1 | 2 | 3 | 4 | 5, number>;

// The full summary a provider profile renders: the authoritative overall
// average + count, the optional dimension averages and the star histogram.
export type ProviderRatingSummary = {
  rating: number;
  count: number;
  dimensions: DimensionAverages;
  distribution: RatingDistribution;
};

export function emptyDimensions(): DimensionAverages {
  const dims = {} as DimensionAverages;
  for (const dim of REVIEW_DIMENSIONS) dims[dim] = null;
  return dims;
}

export function emptyDistribution(): RatingDistribution {
  return { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
}

export function emptyRatingSummary(): ProviderRatingSummary {
  return {
    rating: 0,
    count: 0,
    dimensions: emptyDimensions(),
    distribution: emptyDistribution(),
  };
}

function dimensionAverages(row: RatingGroupRow): DimensionAverages {
  const dims = {} as DimensionAverages;
  for (const dim of REVIEW_DIMENSIONS) dims[dim] = row._avg[dim] ?? null;
  return dims;
}

// { [providerId]: DimensionAverages } from the overall-rating groupBy rows.
export function aggregateDimensions(
  rows: RatingGroupRow[]
): Record<string, DimensionAverages> {
  const out: Record<string, DimensionAverages> = {};
  for (const row of rows) out[row.providerId] = dimensionAverages(row);
  return out;
}

// Rows from a groupBy on (providerId, rating) with a per-group count.
export type DistributionGroupRow = {
  providerId: string;
  rating: number;
  _count: { _all: number };
};

export function aggregateDistribution(
  rows: DistributionGroupRow[]
): Record<string, RatingDistribution> {
  const out: Record<string, RatingDistribution> = {};
  for (const row of rows) {
    const bucket = (out[row.providerId] ??= emptyDistribution());
    const star = row.rating;
    if (star >= 1 && star <= 5) bucket[star as 1 | 2 | 3 | 4 | 5] += row._count._all;
  }
  return out;
}

// Merge the overall-rating groupBy (avg rating + dimension avgs + count) with
// the per-star distribution groupBy into one summary per provider. Only
// providers present in `base` (≥1 non-deleted review) appear.
export function buildRatingSummaries(
  base: RatingGroupRow[],
  distributionRows: DistributionGroupRow[]
): Record<string, ProviderRatingSummary> {
  const dist = aggregateDistribution(distributionRows);
  const out: Record<string, ProviderRatingSummary> = {};
  for (const row of base) {
    out[row.providerId] = {
      rating: row._avg.rating ?? 0,
      count: row._count._all,
      dimensions: dimensionAverages(row),
      distribution: dist[row.providerId] ?? emptyDistribution(),
    };
  }
  return out;
}
