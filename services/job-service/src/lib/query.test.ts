// Unit tests for the job listing query normalizer (board + /mine pagination).
// Pure functions, so no DB or request is needed — mirrors the caps enforced by
// provider-service's lib/query.ts.
import { describe, expect, it } from "vitest";
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  MAX_BATCH_IDS,
  normalizeListQuery,
  capBatchIds,
} from "./query";

describe("normalizeListQuery", () => {
  it("defaults page to 1 and pageSize to the default when absent", () => {
    expect(normalizeListQuery({})).toEqual({
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
    });
  });

  it("parses valid page/pageSize", () => {
    expect(normalizeListQuery({ page: "3", pageSize: "10" })).toEqual({
      page: 3,
      pageSize: 10,
    });
  });

  it("caps pageSize at the maximum", () => {
    expect(normalizeListQuery({ pageSize: "999" }).pageSize).toBe(MAX_PAGE_SIZE);
  });

  it("accepts `take` as an alias for pageSize", () => {
    expect(normalizeListQuery({ take: "15" }).pageSize).toBe(15);
    // Explicit pageSize wins over take.
    expect(normalizeListQuery({ pageSize: "5", take: "40" }).pageSize).toBe(5);
  });

  it("falls back to defaults for junk, zero, or negative values", () => {
    expect(normalizeListQuery({ page: "0", pageSize: "-2" })).toEqual({
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
    });
    expect(normalizeListQuery({ page: "abc", pageSize: "" })).toEqual({
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
    });
    expect(normalizeListQuery({ page: null, pageSize: null })).toEqual({
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
    });
  });

  it("floors fractional values", () => {
    expect(normalizeListQuery({ page: "2.9", pageSize: "12.5" })).toEqual({
      page: 2,
      pageSize: 12,
    });
  });
});

describe("capBatchIds", () => {
  it("returns short lists unchanged", () => {
    expect(capBatchIds(["a", "b", "c"])).toEqual(["a", "b", "c"]);
  });

  it("caps long lists at MAX_BATCH_IDS", () => {
    const ids = Array.from({ length: MAX_BATCH_IDS + 50 }, (_, i) => `id-${i}`);
    expect(capBatchIds(ids)).toHaveLength(MAX_BATCH_IDS);
  });
});
