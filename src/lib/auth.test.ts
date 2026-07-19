import { SignJWT } from "jose";
import { beforeEach, describe, expect, it, vi } from "vitest";

// next/headers is request-scoped; getBearerSession never touches it, but the
// module imports it at top level — a stub keeps the import inert in node tests.
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
}));

const sessionVersionOkMock = vi.fn<
  (userId: string, sv: number) => Promise<boolean>
>(async () => true);
vi.mock("./session-version", () => ({
  sessionVersionOk: (userId: string, sv: number) =>
    sessionVersionOkMock(userId, sv),
}));

import { getBearerSession } from "./auth";

// Mint with the same secret the module resolves — CI exports AUTH_SECRET
// (ci-dummy-secret) while local test runs fall back to the dev default.
const secret = new TextEncoder().encode(
  process.env.AUTH_SECRET ?? "dev-only-secret"
);

async function mintToken(
  payload: Record<string, unknown>,
  { alg = "HS256", exp = "15m" }: { alg?: string; exp?: string } = {}
) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg })
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(secret);
}

beforeEach(() => {
  sessionVersionOkMock.mockClear();
  sessionVersionOkMock.mockResolvedValue(true);
});

describe("getBearerSession", () => {
  it("returns the session payload for a valid Bearer token", async () => {
    const token = await mintToken({
      userId: "u1",
      role: "CUSTOMER",
      name: "Nimal",
      sv: 2,
    });
    const session = await getBearerSession(`Bearer ${token}`);
    expect(session).toMatchObject({
      userId: "u1",
      role: "CUSTOMER",
      name: "Nimal",
    });
    expect(sessionVersionOkMock).toHaveBeenCalledWith("u1", 2);
  });

  it("rejects a revoked token (sessionVersion bump)", async () => {
    sessionVersionOkMock.mockResolvedValue(false);
    const token = await mintToken({
      userId: "u1",
      role: "CUSTOMER",
      name: "Nimal",
      sv: 1,
    });
    expect(await getBearerSession(`Bearer ${token}`)).toBeNull();
  });

  it("rejects missing header, wrong scheme, and malformed tokens", async () => {
    expect(await getBearerSession(null)).toBeNull();
    expect(await getBearerSession("Basic abc")).toBeNull();
    expect(await getBearerSession("Bearer")).toBeNull();
    expect(await getBearerSession("Bearer not-a-jwt")).toBeNull();
  });

  it("rejects an expired token", async () => {
    const token = await mintToken(
      { userId: "u1", role: "CUSTOMER", name: "Nimal", sv: 0 },
      { exp: "0s" }
    );
    expect(await getBearerSession(`Bearer ${token}`)).toBeNull();
  });
});
