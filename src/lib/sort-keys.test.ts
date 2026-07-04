import { describe, expect, it } from "vitest";
import { DEFAULT_SORT, normalizeSort, SORT_KEYS } from "./sort-keys";

describe("normalizeSort", () => {
  it("passes through every valid sort key", () => {
    for (const key of SORT_KEYS) {
      expect(normalizeSort(key)).toBe(key);
    }
  });

  it("normalizes unknown or missing values to the default", () => {
    // Sort keys arrive from user-editable URLs — anything unexpected must
    // collapse to the default rather than leak into the gateway query.
    expect(normalizeSort("cheapest")).toBe(DEFAULT_SORT);
    expect(normalizeSort("")).toBe(DEFAULT_SORT);
    expect(normalizeSort(undefined)).toBe(DEFAULT_SORT);
    expect(normalizeSort(null)).toBe(DEFAULT_SORT);
    expect(normalizeSort(["rating"])).toBe(DEFAULT_SORT);
  });
});
