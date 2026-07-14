// WHERE/ORDER BY builder tests. Prisma.Sql exposes the parameterized statement
// (`sql` with ? placeholders) and the bound `values`, so the assertions pin
// both the SQL shape and that user input only ever travels as parameters.
import { describe, expect, it } from "vitest";
import { buildOrderBy, buildWhere, escapeLike } from "./sql";

describe("escapeLike", () => {
  it("escapes LIKE wildcards the way Prisma contains does", () => {
    expect(escapeLike("50%_off\\now")).toBe("50\\%\\_off\\\\now");
    expect(escapeLike("plain")).toBe("plain");
  });
});

describe("buildWhere", () => {
  it("is empty with no filters (the index holds only public rows)", () => {
    const where = buildWhere({});
    expect(where.sql.trim()).toBe("");
    expect(where.sql).not.toContain("suspended");
  });

  it("filters district as a membership test on the served set", () => {
    const where = buildWhere({ district: "Colombo" });
    expect(where.sql).toContain(`"serviceDistricts" @> ARRAY[?]::text[]`);
    expect(where.values).toEqual(["Colombo"]);
  });

  it("applies effective availability (away-until-future is unavailable)", () => {
    const now = new Date("2026-07-14T00:00:00Z");
    const where = buildWhere({ availableOnly: true }, now);
    expect(where.sql).toContain(`"available" = true`);
    expect(where.sql).toContain(`"awayUntil" IS NULL OR "awayUntil" <= ?`);
    expect(where.values).toContain(now);
  });

  it("matches a price range when ANY service price falls inside it", () => {
    const where = buildWhere({ priceMin: 1000, priceMax: 5000 });
    expect(where.sql).toContain(`EXISTS (SELECT 1 FROM unnest("servicePrices")`);
    expect(where.sql).toContain("sp.price >= ?");
    expect(where.sql).toContain("sp.price <= ?");
    expect(where.values).toEqual([1000, 5000]);
  });

  it("never lets an unreviewed provider satisfy a rating minimum", () => {
    const where = buildWhere({ ratingMin: 4 });
    expect(where.sql).toContain(`"ratingAvg" IS NOT NULL AND "ratingAvg" >= ?`);
  });

  it("builds the free-text OR with FTS + ILIKE arms and parameterized input", () => {
    const where = buildWhere({ q: "brake repair", categorySlugs: ["mechanic"] });
    expect(where.sql).toContain(`"tsv_en" @@ websearch_to_tsquery('english', ?)`);
    expect(where.sql).toContain(`"tsv_si" @@ websearch_to_tsquery('simple', ?)`);
    expect(where.sql).toContain(`"headline" ILIKE ?`);
    expect(where.sql).toContain(`unnest("serviceTitles")`);
    expect(where.sql).toContain(`"category" IN (?)`);
    expect(where.values).toContain("%brake repair%");
    expect(where.values).toContain("mechanic");
  });

  it("omits the category-slug arm when no label matched", () => {
    const where = buildWhere({ q: "brake" });
    expect(where.sql).not.toContain(`"category" IN`);
  });

  it("radius-filters via ST_DWithin in meters, excluding unpinned rows", () => {
    const where = buildWhere({ point: { lat: 6.9, lng: 79.86 }, radiusKm: 25 });
    expect(where.sql).toContain(`"location" IS NOT NULL`);
    expect(where.sql).toContain("ST_DWithin");
    expect(where.values).toContain(25_000);
    // lng before lat: ST_MakePoint(x, y).
    const lngIdx = where.values.indexOf(79.86);
    const latIdx = where.values.indexOf(6.9);
    expect(lngIdx).toBeGreaterThanOrEqual(0);
    expect(lngIdx).toBeLessThan(latIdx);
  });
});

describe("buildOrderBy", () => {
  it("reproduces browse's comparator chains with a deterministic tiebreak", () => {
    expect(buildOrderBy("rating").sql).toContain(
      `"ratingAvg" DESC NULLS LAST, "ratingCount" DESC`
    );
    expect(buildOrderBy("price").sql).toContain(`"minPrice" ASC NULLS LAST`);
    expect(buildOrderBy("reviews").sql).toContain(`"ratingCount" DESC`);
    expect(buildOrderBy("experience").sql).toContain(`"experience" DESC`);
    expect(buildOrderBy("newest").sql).toBe(`"createdAt" DESC, "providerId" ASC`);
  });

  it("scores recommended with the Bayesian prior + recency + verified boost", () => {
    const order = buildOrderBy("recommended");
    expect(order.sql).toContain(`coalesce("ratingAvg", 0) * "ratingCount"`);
    expect(order.sql).toContain("exp(-GREATEST(extract(epoch FROM");
    expect(order.sql).toContain(`"verificationStatus" = 'VERIFIED'`);
    expect(order.values).toContain(12); // PRIOR_MEAN * PRIOR_COUNT
    expect(order.values).toContain(0.75); // VERIFIED_BOOST
  });

  it("orders distance by KNN and falls back to newest without a point", () => {
    const order = buildOrderBy("distance", { lat: 6.9, lng: 79.86 });
    expect(order.sql).toContain(`"location" <->`);
    expect(buildOrderBy("distance", null).sql).toBe(
      `"createdAt" DESC, "providerId" ASC`
    );
  });
});
