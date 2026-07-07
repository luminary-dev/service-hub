import { describe, it, expect } from "vitest";
import {
  normalizeAdminListQuery,
  buildAdminProvidersWhere,
  ADMIN_DEFAULT_PAGE_SIZE,
  ADMIN_MAX_PAGE_SIZE,
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
