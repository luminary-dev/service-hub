import { describe, it, expect } from "vitest";
import { normalizeListQuery, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "./query";

describe("normalizeListQuery", () => {
  it("returns defaults when nothing is provided", () => {
    expect(normalizeListQuery({})).toEqual({
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
      sort: "recommended",
    });
  });

  it("parses valid values", () => {
    const q = normalizeListQuery({ page: "3", pageSize: "20", sort: "rating" });
    expect(q).toEqual({ page: 3, pageSize: 20, sort: "rating" });
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
});
