import { describe, it, expect } from "vitest";
import { buildBrowseWhere, buildSearchWhere } from "./search";

describe("buildSearchWhere", () => {
  it("returns an empty fragment for empty/whitespace/missing queries", () => {
    expect(buildSearchWhere("", [])).toEqual({});
    expect(buildSearchWhere("   ", ["mechanic"])).toEqual({});
    expect(buildSearchWhere(null, [])).toEqual({});
    expect(buildSearchWhere(undefined, [])).toEqual({});
  });

  it("builds the insensitive contains OR over the searched columns", () => {
    const where = buildSearchWhere("wiring", []);
    expect(where.OR).toEqual([
      { headline: { contains: "wiring", mode: "insensitive" } },
      { bio: { contains: "wiring", mode: "insensitive" } },
      { city: { contains: "wiring", mode: "insensitive" } },
      { contactName: { contains: "wiring", mode: "insensitive" } },
      { services: { some: { title: { contains: "wiring", mode: "insensitive" } } } },
    ]);
  });

  it("trims the query", () => {
    const where = buildSearchWhere("  brake  ", []);
    expect(where.OR?.[0]).toEqual({
      headline: { contains: "brake", mode: "insensitive" },
    });
  });

  it("includes category IN (...) when label-matched slugs are passed", () => {
    const where = buildSearchWhere("mechanic", ["mechanic", "ac-repair"]);
    expect(where.OR).toContainEqual({
      category: { in: ["mechanic", "ac-repair"] },
    });
  });

  it("omits the category clause when no slugs matched", () => {
    const where = buildSearchWhere("mechanic", []);
    expect(where.OR).toHaveLength(5);
    expect(where.OR).not.toContainEqual(
      expect.objectContaining({ category: expect.anything() })
    );
  });

  it("supports Sinhala query text as-is (slug resolution happens upstream)", () => {
    const where = buildSearchWhere("කාර්මික", ["mechanic"]);
    expect(where.OR).toContainEqual({ category: { in: ["mechanic"] } });
    expect(where.OR).toContainEqual({
      headline: { contains: "කාර්මික", mode: "insensitive" },
    });
  });
});

describe("buildBrowseWhere", () => {
  it("always excludes suspended providers", () => {
    expect(buildBrowseWhere({})).toEqual({ suspended: false });
  });

  it("applies category and district exact filters", () => {
    expect(buildBrowseWhere({ category: "plumber", district: "Kandy" })).toEqual({
      suspended: false,
      category: "plumber",
      district: "Kandy",
    });
  });

  it("ignores empty-string category/district", () => {
    expect(buildBrowseWhere({ category: "", district: "" })).toEqual({
      suspended: false,
    });
  });

  it("matches a price range when ANY service falls inside it", () => {
    expect(buildBrowseWhere({ priceMin: 1000, priceMax: 5000 })).toEqual({
      suspended: false,
      services: { some: { price: { gte: 1000, lte: 5000 } } },
    });
  });

  it("supports open-ended price bounds", () => {
    expect(buildBrowseWhere({ priceMin: 1000 }).services).toEqual({
      some: { price: { gte: 1000 } },
    });
    expect(buildBrowseWhere({ priceMax: 5000 }).services).toEqual({
      some: { price: { lte: 5000 } },
    });
    expect(buildBrowseWhere({}).services).toBeUndefined();
  });

  it("treats priceMin 0 as a real bound", () => {
    expect(buildBrowseWhere({ priceMin: 0 }).services).toEqual({
      some: { price: { gte: 0 } },
    });
  });

  it("adds the availability clauses only when availableOnly is set", () => {
    const now = new Date("2026-07-05T12:00:00Z");
    const where = buildBrowseWhere({ availableOnly: true }, now);
    expect(where.available).toBe(true);
    // Away mode (#49): a provider away until a future date must be excluded.
    expect(where.AND).toEqual([
      { OR: [{ awayUntil: null }, { awayUntil: { lte: now } }] },
    ]);
    const off = buildBrowseWhere({ availableOnly: false }, now);
    expect(off.available).toBeUndefined();
    expect(off.AND).toBeUndefined();
  });

  it("merges the search OR with the exact filters", () => {
    const where = buildBrowseWhere({
      q: "mechanic",
      categorySlugs: ["mechanic"],
      district: "Colombo",
      availableOnly: true,
    });
    expect(where.suspended).toBe(false);
    expect(where.district).toBe("Colombo");
    expect(where.available).toBe(true);
    expect(where.OR).toContainEqual({ category: { in: ["mechanic"] } });
  });

  it("keeps the away filter and the search OR from clobbering each other", () => {
    const now = new Date("2026-07-05T12:00:00Z");
    const where = buildBrowseWhere({ q: "wiring", availableOnly: true }, now);
    expect(where.OR).toContainEqual({
      headline: { contains: "wiring", mode: "insensitive" },
    });
    expect(where.AND).toEqual([
      { OR: [{ awayUntil: null }, { awayUntil: { lte: now } }] },
    ]);
  });
});
