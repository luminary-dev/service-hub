import { describe, expect, it } from "vitest";
import {
  aggregateDimensions,
  aggregateDistribution,
  aggregateRatings,
  buildRatingSummaries,
  emptyDistribution,
  type DistributionGroupRow,
  type RatingGroupRow,
} from "./ratings";

function row(providerId: string, avg: number | null, count: number): RatingGroupRow {
  return { providerId, _avg: { rating: avg }, _count: { _all: count } };
}

function dist(providerId: string, rating: number, count: number): DistributionGroupRow {
  return { providerId, rating, _count: { _all: count } };
}

describe("aggregateRatings", () => {
  it("returns an empty map for no rows", () => {
    expect(aggregateRatings([])).toEqual({});
  });

  it("keys summaries by providerId", () => {
    expect(aggregateRatings([row("prov_a", 4.5, 2), row("prov_b", 5, 1)])).toEqual({
      prov_a: { rating: 4.5, count: 2 },
      prov_b: { rating: 5, count: 1 },
    });
  });

  it("keeps the average unrounded", () => {
    const avg = (5 + 4 + 4) / 3; // 4.333...
    expect(aggregateRatings([row("prov_a", avg, 3)])).toEqual({
      prov_a: { rating: avg, count: 3 },
    });
    expect(aggregateRatings([row("prov_a", avg, 3)]).prov_a.rating).not.toBe(4.3);
  });

  it("falls back to 0 when the average is null", () => {
    expect(aggregateRatings([row("prov_a", null, 0)])).toEqual({
      prov_a: { rating: 0, count: 0 },
    });
  });
});

describe("aggregateDimensions", () => {
  it("keeps each dimension average unrounded and null when unscored", () => {
    const rows: RatingGroupRow[] = [
      {
        providerId: "prov_a",
        _avg: {
          rating: 4.5,
          quality: 4.5,
          punctuality: 3,
          value: null,
          communication: (5 + 4) / 2,
        },
        _count: { _all: 2 },
      },
    ];
    expect(aggregateDimensions(rows)).toEqual({
      prov_a: {
        quality: 4.5,
        punctuality: 3,
        value: null,
        communication: 4.5,
      },
    });
  });

  it("defaults missing dimension keys to null", () => {
    expect(aggregateDimensions([row("prov_a", 5, 1)])).toEqual({
      prov_a: { quality: null, punctuality: null, value: null, communication: null },
    });
  });
});

describe("aggregateDistribution", () => {
  it("sums per-star counts into a full 1→5 histogram", () => {
    const rows = [dist("prov_a", 5, 3), dist("prov_a", 4, 1), dist("prov_b", 2, 2)];
    expect(aggregateDistribution(rows)).toEqual({
      prov_a: { 1: 0, 2: 0, 3: 0, 4: 1, 5: 3 },
      prov_b: { 1: 0, 2: 2, 3: 0, 4: 0, 5: 0 },
    });
  });

  it("ignores out-of-range stars defensively", () => {
    expect(aggregateDistribution([dist("prov_a", 0, 9), dist("prov_a", 6, 9)])).toEqual({
      prov_a: emptyDistribution(),
    });
  });
});

describe("buildRatingSummaries", () => {
  it("merges averages, dimensions and distribution keyed by provider", () => {
    const base: RatingGroupRow[] = [
      {
        providerId: "prov_a",
        _avg: { rating: 4.5, quality: 5, punctuality: 4, value: null, communication: 4 },
        _count: { _all: 2 },
      },
    ];
    const distribution = [dist("prov_a", 5, 1), dist("prov_a", 4, 1)];
    expect(buildRatingSummaries(base, distribution)).toEqual({
      prov_a: {
        rating: 4.5,
        count: 2,
        dimensions: { quality: 5, punctuality: 4, value: null, communication: 4 },
        distribution: { 1: 0, 2: 0, 3: 0, 4: 1, 5: 1 },
      },
    });
  });

  it("zero-fills the distribution for a provider absent from the histogram rows", () => {
    const base = [row("prov_a", 5, 1)];
    expect(buildRatingSummaries(base, []).prov_a.distribution).toEqual(emptyDistribution());
  });

  it("returns an empty map for no base rows", () => {
    expect(buildRatingSummaries([], [dist("prov_a", 5, 1)])).toEqual({});
  });
});
