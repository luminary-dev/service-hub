import { describe, it, expect } from "vitest";
import {
  normalizeAdminListQuery,
  normalizePagination,
  sliceOpenClosed,
  buildAdminProvidersWhere,
  ADMIN_DEFAULT_PAGE_SIZE,
  ADMIN_MAX_PAGE_SIZE,
  MAX_PAGE,
} from "./admin-list";

describe("normalizeAdminListQuery", () => {
  it("returns defaults when nothing is provided", () => {
    expect(normalizeAdminListQuery({})).toEqual({
      page: 1,
      pageSize: ADMIN_DEFAULT_PAGE_SIZE,
      sort: "newest",
      q: "",
      category: null,
      city: null,
      status: null,
      suspended: null,
    });
  });

  it("clamps page to a minimum of 1", () => {
    expect(normalizeAdminListQuery({ page: "0" }).page).toBe(1);
    expect(normalizeAdminListQuery({ page: "-4" }).page).toBe(1);
    expect(normalizeAdminListQuery({ page: "abc" }).page).toBe(1);
  });

  it("floors fractional pages", () => {
    expect(normalizeAdminListQuery({ page: "3.9" }).page).toBe(3);
  });

  // #753: page feeds the SQL OFFSET, so it is also clamped to MAX_PAGE.
  it("clamps page at MAX_PAGE", () => {
    expect(normalizeAdminListQuery({ page: "999999" }).page).toBe(MAX_PAGE);
    expect(normalizeAdminListQuery({ page: "1e300" }).page).toBe(MAX_PAGE);
  });

  it("caps pageSize at 100 and falls back to 20 for junk", () => {
    expect(normalizeAdminListQuery({ pageSize: "500" }).pageSize).toBe(
      ADMIN_MAX_PAGE_SIZE
    );
    expect(normalizeAdminListQuery({ pageSize: "abc" }).pageSize).toBe(
      ADMIN_DEFAULT_PAGE_SIZE
    );
    expect(normalizeAdminListQuery({ pageSize: "0" }).pageSize).toBe(
      ADMIN_DEFAULT_PAGE_SIZE
    );
  });

  it("normalizes unknown sort keys to newest", () => {
    expect(normalizeAdminListQuery({ sort: "bogus" }).sort).toBe("newest");
    expect(normalizeAdminListQuery({ sort: "mostReviews" }).sort).toBe(
      "mostReviews"
    );
  });

  it("only accepts known verificationStatus values", () => {
    expect(normalizeAdminListQuery({ status: "VERIFIED" }).status).toBe(
      "VERIFIED"
    );
    expect(normalizeAdminListQuery({ status: "bogus" }).status).toBeNull();
    expect(normalizeAdminListQuery({}).status).toBeNull();
  });

  it("only sets suspended for the literal strings true/false", () => {
    expect(normalizeAdminListQuery({ suspended: "true" }).suspended).toBe(true);
    expect(normalizeAdminListQuery({ suspended: "false" }).suspended).toBe(
      false
    );
    expect(normalizeAdminListQuery({ suspended: "1" }).suspended).toBeNull();
    expect(normalizeAdminListQuery({}).suspended).toBeNull();
  });

  it("trims q/category/city and turns blank strings into null/empty", () => {
    const q = normalizeAdminListQuery({
      q: "  jane  ",
      category: "  electrician  ",
      city: "  Colombo  ",
    });
    expect(q.q).toBe("jane");
    expect(q.category).toBe("electrician");
    expect(q.city).toBe("Colombo");

    expect(normalizeAdminListQuery({ category: "   " }).category).toBeNull();
    expect(normalizeAdminListQuery({ city: "" }).city).toBeNull();
  });
});

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
    // 40 open rows, first page of 20.
    expect(sliceOpenClosed(0, 20, 40)).toEqual({
      openSkip: 0,
      openTake: 20,
      closedSkip: 0,
      closedTake: 0,
    });
  });

  it("spans the boundary between the open and closed groups", () => {
    // 10 open rows; page starting at offset 5 pulls 5 open then 15 closed.
    expect(sliceOpenClosed(5, 20, 10)).toEqual({
      openSkip: 5,
      openTake: 5,
      closedSkip: 0,
      closedTake: 15,
    });
  });

  it("takes only closed rows once past the open group", () => {
    // 10 open rows; a page starting at offset 15 is entirely in the closed
    // group, offset 5 into it.
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

describe("buildAdminProvidersWhere", () => {
  it("returns an empty filter when nothing is set", () => {
    expect(buildAdminProvidersWhere({})).toEqual({});
  });

  it("filters by exact category", () => {
    expect(buildAdminProvidersWhere({ category: "electrician" })).toEqual({
      category: "electrician",
    });
  });

  it("filters city case-insensitively with contains", () => {
    expect(buildAdminProvidersWhere({ city: "colombo" })).toEqual({
      city: { contains: "colombo", mode: "insensitive" },
    });
  });

  it("filters by verificationStatus", () => {
    expect(buildAdminProvidersWhere({ status: "PENDING" })).toEqual({
      verificationStatus: "PENDING",
    });
  });

  it("filters by suspended true/false but not when null", () => {
    expect(buildAdminProvidersWhere({ suspended: true })).toEqual({
      suspended: true,
    });
    expect(buildAdminProvidersWhere({ suspended: false })).toEqual({
      suspended: false,
    });
    expect(buildAdminProvidersWhere({ suspended: null })).toEqual({});
  });

  it("searches contactName and contactEmail with q", () => {
    expect(buildAdminProvidersWhere({ q: "jane" })).toEqual({
      OR: [
        { contactName: { contains: "jane", mode: "insensitive" } },
        { contactEmail: { contains: "jane", mode: "insensitive" } },
      ],
    });
  });

  it("ignores a blank/whitespace-only q", () => {
    expect(buildAdminProvidersWhere({ q: "   " })).toEqual({});
  });

  it("combines every filter together", () => {
    expect(
      buildAdminProvidersWhere({
        q: "jane",
        category: "plumber",
        city: "kandy",
        status: "VERIFIED",
        suspended: false,
      })
    ).toEqual({
      category: "plumber",
      city: { contains: "kandy", mode: "insensitive" },
      verificationStatus: "VERIFIED",
      suspended: false,
      OR: [
        { contactName: { contains: "jane", mode: "insensitive" } },
        { contactEmail: { contains: "jane", mode: "insensitive" } },
      ],
    });
  });
});
