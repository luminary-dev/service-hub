import { describe, it, expect } from "vitest";
import { jwtVerify } from "jose";
import { signSession, COOKIE_NAME } from "./session";

// AUTH_SECRET is unset in unit tests, so session.ts falls back to the
// dev-only secret — the same fallback the gateway/web use outside production.
const secret = new TextEncoder().encode("dev-only-secret");

describe("session JWT", () => {
  it("uses the sh_session cookie name", () => {
    expect(COOKIE_NAME).toBe("sh_session");
  });

  it("signs a token that jwtVerify accepts and round-trips the payload", async () => {
    const token = await signSession({
      userId: "user_1",
      role: "PROVIDER",
      name: "Nuwan Perera",
    });
    const { payload, protectedHeader } = await jwtVerify(token, secret);
    expect(protectedHeader.alg).toBe("HS256");
    expect(payload.userId).toBe("user_1");
    expect(payload.role).toBe("PROVIDER");
    expect(payload.name).toBe("Nuwan Perera");
  });

  it("sets a 7-day expiry", async () => {
    const token = await signSession({
      userId: "u",
      role: "CUSTOMER",
      name: "C",
    });
    const { payload } = await jwtVerify(token, secret);
    expect(payload.iat).toBeTypeOf("number");
    expect(payload.exp).toBeTypeOf("number");
    expect(payload.exp! - payload.iat!).toBe(60 * 60 * 24 * 7);
  });

  it("rejects tokens signed with a different secret", async () => {
    const token = await signSession({ userId: "u", role: "CUSTOMER", name: "C" });
    await expect(
      jwtVerify(token, new TextEncoder().encode("some-other-secret"))
    ).rejects.toThrow();
  });
});
