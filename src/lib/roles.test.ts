import { describe, expect, it } from "vitest";
import { hasSupportAccess, hasSuperAdminAccess, isAdminRole } from "./roles";

describe("isAdminRole", () => {
  it("accepts every admin-tier role", () => {
    expect(isAdminRole("ADMIN")).toBe(true);
    expect(isAdminRole("SUPERADMIN")).toBe(true);
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

describe("hasSuperAdminAccess", () => {
  it("grants legacy ADMIN and SUPERADMIN full access", () => {
    expect(hasSuperAdminAccess("ADMIN")).toBe(true);
    expect(hasSuperAdminAccess("SUPERADMIN")).toBe(true);
  });

  it("denies SUPPORT and non-admin roles", () => {
    expect(hasSuperAdminAccess("SUPPORT")).toBe(false);
    expect(hasSuperAdminAccess("CUSTOMER")).toBe(false);
    expect(hasSuperAdminAccess(null)).toBe(false);
  });
});

describe("hasSupportAccess", () => {
  it("grants every admin-tier role support-level access", () => {
    expect(hasSupportAccess("ADMIN")).toBe(true);
    expect(hasSupportAccess("SUPERADMIN")).toBe(true);
    expect(hasSupportAccess("SUPPORT")).toBe(true);
  });

  it("denies non-admin roles", () => {
    expect(hasSupportAccess("CUSTOMER")).toBe(false);
    expect(hasSupportAccess("PROVIDER")).toBe(false);
    expect(hasSupportAccess(undefined)).toBe(false);
  });
});
