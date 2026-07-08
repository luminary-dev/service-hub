import { describe, expect, it } from "vitest";
import { hasSupportAccess, hasFullAdminAccess, isAdminRole } from "./roles";

describe("isAdminRole", () => {
  it("accepts every admin-tier role", () => {
    expect(isAdminRole("ADMIN")).toBe(true);
    expect(isAdminRole("SUPPORT")).toBe(true);
  });

  it("rejects non-admin roles and empty values", () => {
    expect(isAdminRole("CUSTOMER")).toBe(false);
    expect(isAdminRole("PROVIDER")).toBe(false);
    expect(isAdminRole(null)).toBe(false);
    expect(isAdminRole(undefined)).toBe(false);
    expect(isAdminRole("")).toBe(false);
  });
});

describe("hasFullAdminAccess", () => {
  it("grants ADMIN full access", () => {
    expect(hasFullAdminAccess("ADMIN")).toBe(true);
  });

  it("denies SUPPORT and non-admin roles", () => {
    expect(hasFullAdminAccess("SUPPORT")).toBe(false);
    expect(hasFullAdminAccess("CUSTOMER")).toBe(false);
    expect(hasFullAdminAccess(null)).toBe(false);
  });
});

describe("hasSupportAccess", () => {
  it("grants every admin-tier role support-level access", () => {
    expect(hasSupportAccess("ADMIN")).toBe(true);
    expect(hasSupportAccess("SUPPORT")).toBe(true);
  });

  it("denies non-admin roles", () => {
    expect(hasSupportAccess("CUSTOMER")).toBe(false);
    expect(hasSupportAccess("PROVIDER")).toBe(false);
    expect(hasSupportAccess(undefined)).toBe(false);
  });
});
