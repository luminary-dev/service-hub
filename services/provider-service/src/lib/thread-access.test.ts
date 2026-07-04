import { describe, it, expect } from "vitest";
import { lastReadField, otherParty, resolveThreadParty } from "./thread-access";

const auth = (userId: string) => ({ userId, role: "CUSTOMER", name: "X" });
const inquiry = (userId: string | null, providerUserId: string) => ({
  userId,
  provider: { userId: providerUserId },
});

describe("resolveThreadParty", () => {
  it("identifies the inquiry's customer", () => {
    expect(resolveThreadParty(inquiry("u1", "u2"), auth("u1"))).toBe("CUSTOMER");
  });

  it("identifies the receiving provider", () => {
    expect(resolveThreadParty(inquiry("u1", "u2"), auth("u2"))).toBe("PROVIDER");
  });

  it("rejects everyone else", () => {
    expect(resolveThreadParty(inquiry("u1", "u2"), auth("u3"))).toBeNull();
  });

  it("rejects unauthenticated callers", () => {
    expect(resolveThreadParty(inquiry("u1", "u2"), null)).toBeNull();
  });

  it("anonymous inquiries never resolve a customer, even for null-ish ids", () => {
    // The provider can still read their side of an anonymous inquiry.
    expect(resolveThreadParty(inquiry(null, "u2"), auth("u2"))).toBe("PROVIDER");
    expect(resolveThreadParty(inquiry(null, "u2"), auth("u1"))).toBeNull();
  });
});

describe("helpers", () => {
  it("maps parties to their read markers and counterparts", () => {
    expect(lastReadField("CUSTOMER")).toBe("customerLastReadAt");
    expect(lastReadField("PROVIDER")).toBe("providerLastReadAt");
    expect(otherParty("CUSTOMER")).toBe("PROVIDER");
    expect(otherParty("PROVIDER")).toBe("CUSTOMER");
  });
});
