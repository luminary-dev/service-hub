import { describe, it, expect } from "vitest";
import { normalizeListQuery, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "./query";

const NO_FILTERS = {
  priceMin: null,
  priceMax: null,
  ratingMin: null,
  availableOnly: false,
};

describe("normalizeListQuery", () => {
  it("returns defaults when nothing is provided", () => {
    expect(normalizeListQuery({})).toEqual({
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
      sort: "recommended",
      ...NO_FILTERS,
    });
  });

  it("parses valid values", () => {
    const q = normalizeListQuery({ page: "3", pageSize: "20", sort: "rating" });
    expect(q).toEqual({ page: 3, pageSize: 20, sort: "rating", ...NO_FILTERS });
  });

  it("clamps page to a minimum of 1", () => {
    expect(normalizeListQuery({ page: "0" }).page).toBe(1);
    expect(normalizeListQuery({ page: "-4" }).page).toBe(1);
    expect(normalizeListQuery({ page: "abc" }).page).toBe(1);
    expect(normalizeListQuery({ page: null }).page).toBe(1);
  });

  it("floors fractional pages", () => {
    expect(normalizeListQuery({ page: "2.9" }).page).toBe(2);
  });

  it("caps pageSize at 24", () => {
    expect(normalizeListQuery({ pageSize: "100" }).pageSize).toBe(MAX_PAGE_SIZE);
    expect(normalizeListQuery({ pageSize: "24" }).pageSize).toBe(MAX_PAGE_SIZE);
  });

  it("falls back to the default pageSize for junk or non-positive input", () => {
    expect(normalizeListQuery({ pageSize: "abc" }).pageSize).toBe(DEFAULT_PAGE_SIZE);
    expect(normalizeListQuery({ pageSize: null }).pageSize).toBe(DEFAULT_PAGE_SIZE);
    expect(normalizeListQuery({ pageSize: "0" }).pageSize).toBe(DEFAULT_PAGE_SIZE);
    expect(normalizeListQuery({ pageSize: "-5" }).pageSize).toBe(DEFAULT_PAGE_SIZE);
  });

  it("accepts take as an alias for pageSize, with pageSize winning", () => {
    expect(normalizeListQuery({ take: "6" }).pageSize).toBe(6);
    expect(normalizeListQuery({ take: "6", pageSize: "9" }).pageSize).toBe(9);
    expect(normalizeListQuery({ take: "999" }).pageSize).toBe(MAX_PAGE_SIZE);
  });

  it("normalizes unknown sort keys to recommended", () => {
    expect(normalizeListQuery({ sort: "bogus" }).sort).toBe("recommended");
    expect(normalizeListQuery({ sort: "newest" }).sort).toBe("newest");
  });

  it("parses integer rupee price bounds", () => {
    const q = normalizeListQuery({ priceMin: "500", priceMax: "10000" });
    expect(q.priceMin).toBe(500);
    expect(q.priceMax).toBe(10000);
  });

  it("floors fractional prices and accepts 0 as a bound", () => {
    expect(normalizeListQuery({ priceMin: "99.9" }).priceMin).toBe(99);
    expect(normalizeListQuery({ priceMin: "0" }).priceMin).toBe(0);
  });

  it("drops junk or negative prices", () => {
    expect(normalizeListQuery({ priceMin: "abc" }).priceMin).toBeNull();
    expect(normalizeListQuery({ priceMax: "-5" }).priceMax).toBeNull();
    expect(normalizeListQuery({ priceMin: "" }).priceMin).toBeNull();
    expect(normalizeListQuery({}).priceMin).toBeNull();
    expect(normalizeListQuery({}).priceMax).toBeNull();
  });

  it("swaps the price bounds when min > max", () => {
    const q = normalizeListQuery({ priceMin: "9000", priceMax: "1000" });
    expect(q.priceMin).toBe(1000);
    expect(q.priceMax).toBe(9000);
  });

  it("clamps ratingMin into 1..5", () => {
    expect(normalizeListQuery({ ratingMin: "4" }).ratingMin).toBe(4);
    expect(normalizeListQuery({ ratingMin: "3.5" }).ratingMin).toBe(3.5);
    expect(normalizeListQuery({ ratingMin: "9" }).ratingMin).toBe(5);
    expect(normalizeListQuery({ ratingMin: "0" }).ratingMin).toBe(1);
    expect(normalizeListQuery({ ratingMin: "-2" }).ratingMin).toBe(1);
  });

  it("drops junk or absent ratingMin", () => {
    expect(normalizeListQuery({ ratingMin: "abc" }).ratingMin).toBeNull();
    expect(normalizeListQuery({ ratingMin: "" }).ratingMin).toBeNull();
    expect(normalizeListQuery({}).ratingMin).toBeNull();
  });

  it("only sets availableOnly for 1/true", () => {
    expect(normalizeListQuery({ availableOnly: "1" }).availableOnly).toBe(true);
    expect(normalizeListQuery({ availableOnly: "true" }).availableOnly).toBe(true);
    expect(normalizeListQuery({ availableOnly: "0" }).availableOnly).toBe(false);
    expect(normalizeListQuery({ availableOnly: "yes" }).availableOnly).toBe(false);
    expect(normalizeListQuery({}).availableOnly).toBe(false);
  });
});
