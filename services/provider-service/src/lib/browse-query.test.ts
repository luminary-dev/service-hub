// DB-side browse query builder (#748). These assert on the generated SQL text
// and bound parameter values (Prisma.Sql `.text` / `.values`) — no database —
// so the WHERE predicates, the computed sorts, and the count/paginate shape stay
// pinned without a live Postgres.
import { describe, it, expect } from "vitest";
import {
  browseCountQuery,
  browseIdsQuery,
  browseOrderBySql,
  browseWhereSql,
} from "./browse-query";
import { VERIFIED_BOOST } from "./sort";

const NOW = new Date("2026-07-16T00:00:00.000Z");

describe("browseWhereSql", () => {
  it("always excludes suspended providers and takes no params when unfiltered", () => {
    const sql = browseWhereSql({}, NOW);
    expect(sql.text).toContain(`"suspended" = false`);
    expect(sql.values).toEqual([]);
  });

  it("binds category, district (array membership) and availability", () => {
    const sql = browseWhereSql(
      { category: "plumbing", district: "Kandy", availableOnly: true },
      NOW
    );
    expect(sql.text).toContain(`p."category" = $`);
    expect(sql.text).toContain(`= ANY(p."serviceDistricts")`);
    expect(sql.text).toContain(`p."available" = true`);
    expect(sql.text).toContain(`p."awayUntil" IS NULL OR p."awayUntil" <=`);
    expect(sql.values).toContain("plumbing");
    expect(sql.values).toContain("Kandy");
    expect(sql.values).toContain(NOW);
  });

  it("filters price via an EXISTS over the provider's services", () => {
    const both = browseWhereSql({ priceMin: 1000, priceMax: 5000 }, NOW);
    expect(both.text).toContain(`EXISTS (SELECT 1 FROM "Service" s`);
    expect(both.text).toContain(`s."price" >= $`);
    expect(both.text).toContain(`s."price" <= $`);
    expect(both.values).toEqual(expect.arrayContaining([1000, 5000]));

    const minOnly = browseWhereSql({ priceMin: 0 }, NOW);
    expect(minOnly.text).toContain(`s."price" >= $`);
    expect(minOnly.text).not.toContain(`s."price" <= $`);
    expect(minOnly.values).toContain(0);
  });

  it("applies ratingMin as a column predicate excluding no-review providers", () => {
    const sql = browseWhereSql({ ratingMin: 4 }, NOW);
    expect(sql.text).toContain(`p."ratingCount" > 0`);
    expect(sql.text).toContain(`p."ratingAvg" >= $`);
    expect(sql.values).toContain(4);
  });

  it("builds the bilingual free-text OR with a category-slug match", () => {
    const sql = browseWhereSql(
      { q: "wiring", categorySlugs: ["electrician", "ac-repair"] },
      NOW
    );
    expect(sql.text).toContain(`p."headline" ILIKE $`);
    expect(sql.text).toContain(`p."headlineSi" ILIKE $`);
    expect(sql.text).toContain(`p."bioSi" ILIKE $`);
    expect(sql.text).toContain(`p."contactName" ILIKE $`);
    expect(sql.text).toContain(`s."title" ILIKE $`);
    expect(sql.text).toContain(`p."category" = ANY($`);
    // The ILIKE pattern wraps the term in wildcards, reused across the OR arms.
    expect(sql.values).toContain("%wiring%");
    expect(sql.values).toContainEqual(["electrician", "ac-repair"]);
  });

  it("omits the search OR entirely for a blank query", () => {
    const sql = browseWhereSql({ q: "   " }, NOW);
    expect(sql.text).not.toContain("ILIKE");
  });
});

describe("browseOrderBySql", () => {
  it("orders the simple sorts by the denormalized columns", () => {
    expect(browseOrderBySql("rating", NOW).text).toContain(`p."ratingAvg" DESC`);
    expect(browseOrderBySql("reviews", NOW).text).toContain(`p."ratingCount" DESC`);
    expect(browseOrderBySql("experience", NOW).text).toContain(`p."experience" DESC`);
    expect(browseOrderBySql("newest", NOW).text).toBe(`p."createdAt" DESC`);
  });

  it("price sorts by the MIN service price, nulls last", () => {
    const sql = browseOrderBySql("price", NOW);
    expect(sql.text).toContain(`SELECT MIN(s."price")`);
    expect(sql.text).toContain(`ASC NULLS LAST`);
  });

  it("recommended is the Bayesian + recency + verified computed score", () => {
    const sql = browseOrderBySql("recommended", NOW);
    expect(sql.text).toContain(`p."ratingAvg" * p."ratingCount"`);
    expect(sql.text).toContain(`exp(`);
    expect(sql.text).toContain(`EXTRACT(EPOCH FROM`);
    expect(sql.text).toContain(`p."verificationStatus" = 'VERIFIED'`);
    expect(sql.values).toContain(VERIFIED_BOOST);
    expect(sql.text.trimEnd().endsWith(`p."createdAt" DESC`)).toBe(true);
  });

  it("falls back to recommended for an unknown sort key", () => {
    const sql = browseOrderBySql("bogus" as never, NOW);
    expect(sql.text).toContain(`p."verificationStatus" = 'VERIFIED'`);
  });
});

describe("browseIdsQuery / browseCountQuery", () => {
  it("selects a paginated id slice with LIMIT/OFFSET", () => {
    const sql = browseIdsQuery({ category: "plumbing" }, "newest", 12, 24, NOW);
    expect(sql.text).toContain(`SELECT p."id" FROM "Provider" p WHERE`);
    expect(sql.text).toContain("ORDER BY");
    expect(sql.text).toContain("LIMIT $");
    expect(sql.text).toContain("OFFSET $");
    expect(sql.values).toContain(12);
    expect(sql.values).toContain(24);
    expect(sql.values).toContain("plumbing");
  });

  it("counts with the same WHERE and no ordering/pagination", () => {
    const sql = browseCountQuery({ category: "plumbing" }, NOW);
    expect(sql.text).toContain(`SELECT COUNT(*)::int AS count FROM "Provider" p WHERE`);
    expect(sql.text).not.toContain("ORDER BY");
    expect(sql.text).not.toContain("LIMIT");
    expect(sql.values).toContain("plumbing");
  });
});
