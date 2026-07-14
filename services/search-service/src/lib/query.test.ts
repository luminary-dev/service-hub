// The non-geo normalization is a lockstep copy of provider-service's
// lib/query.ts — these cases pin the shared semantics (defaults, caps,
// clamps, swapped price bounds) plus the geo additions.
import { describe, expect, it } from "vitest";
import {
  DEFAULT_RADIUS_KM,
  MAX_RADIUS_KM,
  normalizeSearchQuery,
  parsePoint,
  parseRadiusKm,
} from "./query";

describe("normalizeSearchQuery", () => {
  it("applies browse's defaults", () => {
    const q = normalizeSearchQuery({});
    expect(q).toEqual({
      page: 1,
      pageSize: 12,
      sort: "recommended",
      priceMin: null,
      priceMax: null,
      ratingMin: null,
      availableOnly: false,
      point: null,
      radiusKm: null,
    });
  });

  it("caps pageSize at 24 and honors the take alias", () => {
    expect(normalizeSearchQuery({ pageSize: "100" }).pageSize).toBe(24);
    expect(normalizeSearchQuery({ take: "6" }).pageSize).toBe(6);
  });

  it("swaps a reversed price range", () => {
    const q = normalizeSearchQuery({ priceMin: "5000", priceMax: "1000" });
    expect(q.priceMin).toBe(1000);
    expect(q.priceMax).toBe(5000);
  });

  it("clamps ratingMin into [1, 5]", () => {
    expect(normalizeSearchQuery({ ratingMin: "7" }).ratingMin).toBe(5);
    expect(normalizeSearchQuery({ ratingMin: "0" }).ratingMin).toBe(1);
    expect(normalizeSearchQuery({ ratingMin: "junk" }).ratingMin).toBeNull();
  });

  it("falls back to recommended for unknown sorts", () => {
    expect(normalizeSearchQuery({ sort: "bogus" }).sort).toBe("recommended");
  });

  it("accepts sort=distance only with a valid point", () => {
    expect(normalizeSearchQuery({ sort: "distance" }).sort).toBe("recommended");
    expect(
      normalizeSearchQuery({ sort: "distance", lat: "6.9", lng: "79.86" }).sort
    ).toBe("distance");
  });

  it("ignores radiusKm without a point (mirrors the pin's pair rule)", () => {
    expect(normalizeSearchQuery({ radiusKm: "10" }).radiusKm).toBeNull();
    expect(
      normalizeSearchQuery({ lat: "6.9", lng: "79.86", radiusKm: "10" }).radiusKm
    ).toBe(10);
  });
});

describe("parsePoint", () => {
  it("requires both coordinates in world bounds", () => {
    expect(parsePoint("6.9", "79.86")).toEqual({ lat: 6.9, lng: 79.86 });
    expect(parsePoint("6.9", null)).toBeNull();
    expect(parsePoint(null, "79.86")).toBeNull();
    expect(parsePoint("91", "79.86")).toBeNull();
    expect(parsePoint("6.9", "181")).toBeNull();
    expect(parsePoint("junk", "79.86")).toBeNull();
  });
});

describe("parseRadiusKm", () => {
  it("caps at the max radius and rejects junk/non-positive values", () => {
    expect(parseRadiusKm("250")).toBe(MAX_RADIUS_KM);
    expect(parseRadiusKm("25")).toBe(25);
    expect(parseRadiusKm("0")).toBeNull();
    expect(parseRadiusKm("-5")).toBeNull();
    expect(parseRadiusKm("junk")).toBeNull();
    expect(parseRadiusKm(null)).toBeNull();
  });

  it("keeps the nearby default under the cap", () => {
    expect(DEFAULT_RADIUS_KM).toBeLessThanOrEqual(MAX_RADIUS_KM);
  });
});
