import { describe, it, expect } from "vitest";
import {
  normalizePagination,
  sliceOpenClosed,
  ADMIN_DEFAULT_PAGE_SIZE,
  ADMIN_MAX_PAGE_SIZE,
  MAX_PAGE,
} from "./pagination";

describe("normalizePagination", () => {
  it("defaults to page 1 / default page size", () => {
    expect(normalizePagination({})).toEqual({
      page: 1,
      pageSize: ADMIN_DEFAULT_PAGE_SIZE,
    });
  });

  it("clamps page to a minimum of 1 and floors fractions", () => {
    expect(normalizePagination({ page: "0" }).page).toBe(1);
    expect(normalizePagination({ page: "-3" }).page).toBe(1);
    expect(normalizePagination({ page: "abc" }).page).toBe(1);
    expect(normalizePagination({ page: "4.9" }).page).toBe(4);
  });

  // #753: page also has a ceiling — it feeds the SQL OFFSET, so clamp it to
  // MAX_PAGE to keep skip int-safe and block deep-pagination DoS.
  it("clamps page at MAX_PAGE to bound the OFFSET", () => {
    expect(normalizePagination({ page: "5" }).page).toBe(5);
    expect(normalizePagination({ page: "999999" }).page).toBe(MAX_PAGE);
    expect(normalizePagination({ page: "1e300" }).page).toBe(MAX_PAGE);
  });

  it("caps pageSize at the max and falls back for junk", () => {
    expect(normalizePagination({ pageSize: "1000" }).pageSize).toBe(
      ADMIN_MAX_PAGE_SIZE
    );
    expect(normalizePagination({ pageSize: "0" }).pageSize).toBe(
      ADMIN_DEFAULT_PAGE_SIZE
    );
    expect(normalizePagination({ pageSize: "abc" }).pageSize).toBe(
      ADMIN_DEFAULT_PAGE_SIZE
    );
    expect(normalizePagination({ pageSize: "25" }).pageSize).toBe(25);
  });
});

describe("sliceOpenClosed", () => {
  it("takes only OPEN rows when the page fits inside the open group", () => {
    expect(sliceOpenClosed(0, 20, 40)).toEqual({
      openSkip: 0,
      openTake: 20,
      closedSkip: 0,
      closedTake: 0,
    });
  });

  it("spans the boundary between the open and closed groups", () => {
    expect(sliceOpenClosed(5, 20, 10)).toEqual({
      openSkip: 5,
      openTake: 5,
      closedSkip: 0,
      closedTake: 15,
    });
  });

  it("takes only closed rows once past the open group", () => {
    expect(sliceOpenClosed(15, 20, 10)).toEqual({
      openSkip: 0,
      openTake: 0,
      closedSkip: 5,
      closedTake: 20,
    });
  });

  it("handles an empty open group", () => {
    expect(sliceOpenClosed(0, 20, 0)).toEqual({
      openSkip: 0,
      openTake: 0,
      closedSkip: 0,
      closedTake: 20,
    });
  });
});
