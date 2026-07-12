import { describe, it, expect } from "vitest";
import { SignJWT } from "jose";
import {
  IMPERSONATION_COOKIE,
  SESSION_COOKIE,
  verifyImpersonationToken,
  verifySessionToken,
} from "./session";

// Same secret session.ts resolves at import time: AUTH_SECRET when the
// environment provides one (CI does), else the shared dev fallback.
const secret = new TextEncoder().encode(
  process.env.AUTH_SECRET ?? "dev-only-secret"
);

async function sign(payload: Record<string, unknown>, expiresIn = "15m") {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secret);
}

describe("cookie names", () => {
  it("uses distinct cookie names for real vs. impersonation sessions", () => {
    expect(SESSION_COOKIE).toBe("sh_session");
    expect(IMPERSONATION_COOKIE).toBe("impersonation_session");
    expect(IMPERSONATION_COOKIE).not.toBe(SESSION_COOKIE);
  });
});

describe("verifyImpersonationToken", () => {
  it("accepts a token carrying impersonatedBy + the admin's sv", async () => {
    const token = await sign({
      userId: "user_1",
      role: "PROVIDER",
      name: "Nuwan Perera",
      sv: 0,
      impersonatedBy: "admin_1",
      impersonatedBySv: 3,
    });
    const payload = await verifyImpersonationToken(token);
    expect(payload).toEqual({
      userId: "user_1",
      role: "PROVIDER",
      name: "Nuwan Perera",
      sv: 0,
      impersonatedBy: "admin_1",
      impersonatedBySv: 3,
    });
  });

  it("defaults impersonatedBySv to 0 on a legacy token minted without it", async () => {
    const token = await sign({
      userId: "user_1",
      role: "PROVIDER",
      name: "N",
      sv: 0,
      impersonatedBy: "admin_1",
    });
    const payload = await verifyImpersonationToken(token);
    expect(payload?.impersonatedBySv).toBe(0);
  });

  it("rejects an otherwise-valid session token with no impersonatedBy claim", async () => {
    // A real sh_session token must never be usable as an impersonation
    // token — that's the whole point of the distinguishing claim.
    const token = await sign({
      userId: "user_1",
      role: "PROVIDER",
      name: "Nuwan Perera",
      sv: 0,
    });
    expect(await verifyImpersonationToken(token)).toBeNull();
  });

  it("rejects an expired impersonation token", async () => {
    const token = await sign(
      { userId: "user_1", role: "PROVIDER", name: "N", sv: 0, impersonatedBy: "admin_1" },
      "-1s"
    );
    expect(await verifyImpersonationToken(token)).toBeNull();
  });

  it("rejects tokens signed with a different secret", async () => {
    const token = await new SignJWT({
      userId: "user_1",
      role: "PROVIDER",
      name: "N",
      sv: 0,
      impersonatedBy: "admin_1",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("15m")
      .sign(new TextEncoder().encode("some-other-secret"));
    expect(await verifyImpersonationToken(token)).toBeNull();
  });
});

describe("verifySessionToken", () => {
  it("still verifies a normal session token unaffected by the impersonation addition", async () => {
    const token = await sign(
      { userId: "user_1", role: "CUSTOMER", name: "C", sv: 2 },
      "7d"
    );
    expect(await verifySessionToken(token)).toEqual({
      userId: "user_1",
      role: "CUSTOMER",
      name: "C",
      sv: 2,
    });
  });
});
