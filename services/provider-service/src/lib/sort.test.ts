import { describe, it, expect } from "vitest";
import {
  DEFAULT_SORT,
  normalizeSort,
  PRIOR_COUNT,
  PRIOR_MEAN,
  RECENCY_HALFLIFE_DAYS,
  RECENCY_WEIGHT,
  SORT_KEYS,
  VERIFIED_BOOST,
} from "./sort";

describe("normalizeSort", () => {
  it("accepts known keys", () => {
    expect(normalizeSort("rating")).toBe("rating");
    expect(normalizeSort("price")).toBe("price");
  });
  it("falls back to recommended for unknown/empty", () => {
    expect(normalizeSort("bogus")).toBe("recommended");
    expect(normalizeSort(undefined)).toBe("recommended");
    expect(normalizeSort(123)).toBe("recommended");
  });
});

describe("ranking constants", () => {
  it("recommended is the default and a valid key", () => {
    expect(DEFAULT_SORT).toBe("recommended");
    expect(SORT_KEYS).toContain("recommended");
  });

  // The Bayesian score is computed DB-side now (#748, lib/browse-query.ts); the
  // constants remain the single source of truth for that expression. Guard the
  // shape so the SQL builder keeps sane, finite priors.
  it("exposes finite, positive ranking priors", () => {
    for (const n of [
      PRIOR_COUNT,
      PRIOR_MEAN,
      RECENCY_WEIGHT,
      RECENCY_HALFLIFE_DAYS,
      VERIFIED_BOOST,
    ]) {
      expect(Number.isFinite(n)).toBe(true);
      expect(n).toBeGreaterThan(0);
    }
  });
});
