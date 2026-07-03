import { describe, it, expect } from "vitest";
import { normalizeSort, sortProviders, type Sortable } from "./sort";

function make(overrides: Partial<Sortable> & { id: string }): Sortable & {
  id: string;
} {
  return {
    rating: null,
    ratingSum: 0,
    reviewCount: 0,
    fromPrice: null,
    experience: 0,
    createdAt: new Date("2024-01-01"),
    verified: false,
    ...overrides,
  };
}

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

describe("sortProviders", () => {
  it("orders by experience desc", () => {
    const items = [
      make({ id: "a", experience: 2 }),
      make({ id: "b", experience: 10 }),
      make({ id: "c", experience: 5 }),
    ];
    expect(sortProviders(items, "experience").map((p) => p.id)).toEqual([
      "b",
      "c",
      "a",
    ]);
  });

  it("orders by lowest price with nulls last", () => {
    const items = [
      make({ id: "a", fromPrice: 5000 }),
      make({ id: "b", fromPrice: null }),
      make({ id: "c", fromPrice: 2000 }),
    ];
    expect(sortProviders(items, "price").map((p) => p.id)).toEqual([
      "c",
      "a",
      "b",
    ]);
  });

  it("orders by highest rating with unrated last", () => {
    const items = [
      make({ id: "a", rating: 4.5, reviewCount: 2 }),
      make({ id: "b", rating: null }),
      make({ id: "c", rating: 5, reviewCount: 3 }),
    ];
    expect(sortProviders(items, "rating").map((p) => p.id)).toEqual([
      "c",
      "a",
      "b",
    ]);
  });

  it("orders by most reviews", () => {
    const items = [
      make({ id: "a", reviewCount: 1 }),
      make({ id: "b", reviewCount: 9 }),
      make({ id: "c", reviewCount: 4 }),
    ];
    expect(sortProviders(items, "reviews").map((p) => p.id)).toEqual([
      "b",
      "c",
      "a",
    ]);
  });

  it("recommended ranks a strong track record above a single 5-star", () => {
    const established = make({
      id: "established",
      rating: 4.8,
      ratingSum: 4.8 * 40,
      reviewCount: 40,
    });
    const oneReview = make({
      id: "oneReview",
      rating: 5,
      ratingSum: 5,
      reviewCount: 1,
    });
    const ranked = sortProviders([oneReview, established], "recommended");
    expect(ranked[0].id).toBe("established");
  });

  it("recommended boosts a verified provider over an equal unverified one", () => {
    const base = { rating: 4.5, ratingSum: 4.5 * 5, reviewCount: 5 };
    const verified = make({ id: "verified", ...base, verified: true });
    const plain = make({ id: "plain", ...base, verified: false });
    const ranked = sortProviders([plain, verified], "recommended");
    expect(ranked[0].id).toBe("verified");
  });

  it("does not mutate the input array", () => {
    const items = [
      make({ id: "a", experience: 1 }),
      make({ id: "b", experience: 2 }),
    ];
    const before = items.map((p) => p.id);
    sortProviders(items, "experience");
    expect(items.map((p) => p.id)).toEqual(before);
  });
});
