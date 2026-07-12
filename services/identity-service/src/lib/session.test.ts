import { describe, it, expect } from "vitest";
import { jwtVerify } from "jose";
import {
  signSession,
  COOKIE_NAME,
  signImpersonationSession,
  IMPERSONATION_COOKIE_NAME,
  IMPERSONATION_TTL_SECONDS,
} from "./session";

// Verify with the same secret session.ts resolved at import time: AUTH_SECRET
// when the environment provides one (CI does), else the shared dev fallback.
const secret = new TextEncoder().encode(
  process.env.AUTH_SECRET ?? "dev-only-secret"
);

describe("session JWT", () => {
  it("uses the sh_session cookie name", () => {
    expect(COOKIE_NAME).toBe("sh_session");
  });

  it("signs a token that jwtVerify accepts and round-trips the payload", async () => {
    const token = await signSession({
      userId: "user_1",
      role: "PROVIDER",
      name: "Nuwan Perera",
      sv: 3,
    });
    const { payload, protectedHeader } = await jwtVerify(token, secret);
    expect(protectedHeader.alg).toBe("HS256");
    expect(payload.userId).toBe("user_1");
    expect(payload.role).toBe("PROVIDER");
    expect(payload.name).toBe("Nuwan Perera");
    expect(payload.sv).toBe(3);
  });

  it("sets a 7-day expiry", async () => {
    const token = await signSession({
      userId: "u",
      role: "CUSTOMER",
      name: "C",
      sv: 0,
    });
    const { payload } = await jwtVerify(token, secret);
    expect(payload.iat).toBeTypeOf("number");
    expect(payload.exp).toBeTypeOf("number");
    expect(payload.exp! - payload.iat!).toBe(60 * 60 * 24 * 7);
  });

  it("rejects tokens signed with a different secret", async () => {
    const token = await signSession({ userId: "u", role: "CUSTOMER", name: "C", sv: 0 });
    await expect(
      jwtVerify(token, new TextEncoder().encode("some-other-secret"))
    ).rejects.toThrow();
  });
});

describe("impersonation session JWT (#234)", () => {
  it("uses a distinct cookie name from the real session", () => {
    expect(IMPERSONATION_COOKIE_NAME).toBe("impersonation_session");
    expect(IMPERSONATION_COOKIE_NAME).not.toBe(COOKIE_NAME);
  });

  it("signs a token carrying impersonatedBy + the admin's sv alongside the usual claims", async () => {
    const token = await signImpersonationSession({
      userId: "user_1",
      role: "CUSTOMER",
      name: "Nuwan Perera",
      sv: 1,
      impersonatedBy: "admin_1",
      impersonatedBySv: 4,
    });
    const { payload, protectedHeader } = await jwtVerify(token, secret);
    expect(protectedHeader.alg).toBe("HS256");
    expect(payload.userId).toBe("user_1");
    expect(payload.role).toBe("CUSTOMER");
    expect(payload.sv).toBe(1);
    expect(payload.impersonatedBy).toBe("admin_1");
    // The admin's own session version rides along so verifiers can revoke an
    // active impersonation when the admin is logged out (#358).
    expect(payload.impersonatedBySv).toBe(4);
  });

  it("expires in 15 minutes regardless of the normal 7-day session TTL", async () => {
    expect(IMPERSONATION_TTL_SECONDS).toBe(15 * 60);
    const token = await signImpersonationSession({
      userId: "u",
      role: "CUSTOMER",
      name: "C",
      sv: 0,
      impersonatedBy: "admin_1",
      impersonatedBySv: 0,
    });
    const { payload } = await jwtVerify(token, secret);
    expect(payload.exp! - payload.iat!).toBe(15 * 60);
  });
});
