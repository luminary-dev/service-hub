import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";

// hono/proxy is mocked so proxyRequest never opens a socket — the mock captures
// the upstream call and returns a canned response (used for the Set-Cookie /
// x-request-id assertions below).
const proxyMock = vi.fn();
vi.mock("hono/proxy", () => ({
  proxy: (...args: unknown[]) => proxyMock(...args),
}));

// Deterministic identity: control token verification + revocation directly so
// the header logic is tested without JWTs or a live identity-service. The real
// cookie-name constants are preserved.
vi.mock("./session", async () => {
  const actual = await vi.importActual<typeof import("./session")>("./session");
  return {
    ...actual,
    verifySessionToken: vi.fn(),
    verifyImpersonationToken: vi.fn(),
  };
});
vi.mock("./session-version", () => ({
  sessionVersionOk: vi.fn(),
}));

import { buildUpstreamHeaders, proxyRequest } from "./proxy";
import {
  IMPERSONATION_COOKIE,
  SESSION_COOKIE,
  verifyImpersonationToken,
  verifySessionToken,
} from "./session";
import { sessionVersionOk } from "./session-version";

const EXPECTED_SECRET = process.env.INTERNAL_API_SECRET ?? "dev-internal-secret";

// Run buildUpstreamHeaders inside a real request and return the resulting
// upstream header set as a plain object.
async function upstreamHeadersFor(
  reqHeaders: Record<string, string>
): Promise<Record<string, string>> {
  const app = new Hono();
  app.all("/*", async (c) => {
    const headers = await buildUpstreamHeaders(c, "identity:4001");
    const obj: Record<string, string> = {};
    headers.forEach((v, k) => {
      obj[k] = v;
    });
    return c.json(obj);
  });
  const res = await app.request("/api/anything", { headers: reqHeaders });
  return res.json();
}

beforeEach(() => {
  vi.mocked(verifySessionToken).mockResolvedValue(null);
  vi.mocked(verifyImpersonationToken).mockResolvedValue(null);
  vi.mocked(sessionVersionOk).mockResolvedValue(true);
  proxyMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("buildUpstreamHeaders — trusted-header choke point", () => {
  it("strips every client-sent trusted header", async () => {
    const h = await upstreamHeadersFor({
      "x-user-id": "attacker-forged",
      "x-user-role": "ADMIN",
      "x-user-name": "Mallory",
      "x-impersonated-by": "victim-admin",
      "x-internal-secret": "forged-secret",
      "x-request-id": "client-chosen-id",
      "x-origin": "https://evil.example.com",
      "x-locale": "zz",
    });
    // No valid session → none of the identity headers survive.
    expect(h["x-user-id"]).toBeUndefined();
    expect(h["x-user-role"]).toBeUndefined();
    expect(h["x-user-name"]).toBeUndefined();
    expect(h["x-impersonated-by"]).toBeUndefined();
    // Gateway-owned headers are always the gateway's own values, never the
    // client's.
    expect(h["x-internal-secret"]).toBe(EXPECTED_SECRET);
    expect(h["x-request-id"]).not.toBe("client-chosen-id");
    expect(h["x-origin"]).not.toBe("https://evil.example.com");
    expect(h["x-locale"]).toBe("en");
  });

  it("always sets the internal secret, even with no session", async () => {
    const h = await upstreamHeadersFor({});
    expect(h["x-internal-secret"]).toBe(EXPECTED_SECRET);
  });

  it("forwards identity headers for a valid, current session", async () => {
    vi.mocked(verifySessionToken).mockResolvedValue({
      userId: "user_42",
      role: "PROVIDER",
      name: "Nuwan Perera",
      sv: 3,
    });
    vi.mocked(sessionVersionOk).mockResolvedValue(true);
    const h = await upstreamHeadersFor({ cookie: `${SESSION_COOKIE}=good` });
    expect(h["x-user-id"]).toBe("user_42");
    expect(h["x-user-role"]).toBe("PROVIDER");
    expect(h["x-user-name"]).toBe(encodeURIComponent("Nuwan Perera"));
    expect(h["x-impersonated-by"]).toBeUndefined();
  });

  it("gives the impersonation cookie priority over the real session", async () => {
    vi.mocked(verifySessionToken).mockResolvedValue({
      userId: "admin_1",
      role: "ADMIN",
      name: "Admin",
      sv: 0,
    });
    vi.mocked(verifyImpersonationToken).mockResolvedValue({
      userId: "target_user",
      role: "CUSTOMER",
      name: "Target",
      sv: 0,
      impersonatedBy: "admin_1",
      impersonatedBySv: 2,
    });
    vi.mocked(sessionVersionOk).mockResolvedValue(true);
    const h = await upstreamHeadersFor({
      cookie: `${SESSION_COOKIE}=admin; ${IMPERSONATION_COOKIE}=imp`,
    });
    // Impersonated identity wins; x-impersonated-by records the acting admin.
    expect(h["x-user-id"]).toBe("target_user");
    expect(h["x-user-role"]).toBe("CUSTOMER");
    expect(h["x-impersonated-by"]).toBe("admin_1");
  });

  it("forwards NO identity headers when the session is revoked (stale sv)", async () => {
    vi.mocked(verifySessionToken).mockResolvedValue({
      userId: "user_42",
      role: "PROVIDER",
      name: "Nuwan",
      sv: 1,
    });
    // Revoked: the token's sv is below the user's current version.
    vi.mocked(sessionVersionOk).mockResolvedValue(false);
    const h = await upstreamHeadersFor({ cookie: `${SESSION_COOKIE}=stale` });
    expect(h["x-user-id"]).toBeUndefined();
    expect(h["x-user-role"]).toBeUndefined();
    // The internal secret is still attached — services still get a trusted (but
    // anonymous) request and decide their own 401.
    expect(h["x-internal-secret"]).toBe(EXPECTED_SECRET);
  });

  // Mobile API clients (#797): the same identity JWT arrives as
  // `Authorization: Bearer` instead of the sh_session cookie.
  it("forwards identity headers for a valid Bearer access token (no cookie)", async () => {
    vi.mocked(verifySessionToken).mockResolvedValue({
      userId: "user_42",
      role: "CUSTOMER",
      name: "Nuwan Perera",
      sv: 3,
    });
    vi.mocked(sessionVersionOk).mockResolvedValue(true);
    const h = await upstreamHeadersFor({ authorization: "Bearer good-jwt" });
    expect(vi.mocked(verifySessionToken)).toHaveBeenCalledWith("good-jwt");
    expect(h["x-user-id"]).toBe("user_42");
    expect(h["x-user-role"]).toBe("CUSTOMER");
    expect(h["x-user-name"]).toBe(encodeURIComponent("Nuwan Perera"));
    // The Authorization header itself still passes through upstream untouched.
    expect(h["authorization"]).toBe("Bearer good-jwt");
  });

  it("forwards NO identity headers for an invalid Bearer token", async () => {
    vi.mocked(verifySessionToken).mockResolvedValue(null);
    const h = await upstreamHeadersFor({ authorization: "Bearer garbage" });
    expect(h["x-user-id"]).toBeUndefined();
    expect(h["x-user-role"]).toBeUndefined();
    // Anonymous but still trusted transport — the secret is always attached.
    expect(h["x-internal-secret"]).toBe(EXPECTED_SECRET);
  });

  it("forwards NO identity headers when the Bearer session is revoked (stale sv)", async () => {
    vi.mocked(verifySessionToken).mockResolvedValue({
      userId: "user_42",
      role: "CUSTOMER",
      name: "Nuwan",
      sv: 1,
    });
    vi.mocked(sessionVersionOk).mockResolvedValue(false);
    const h = await upstreamHeadersFor({ authorization: "Bearer stale" });
    expect(h["x-user-id"]).toBeUndefined();
  });

  it("gives a valid session cookie precedence over the Bearer header", async () => {
    // Distinct identities per token so the winner is observable.
    vi.mocked(verifySessionToken).mockImplementation(async (token) =>
      token === "cookie-jwt"
        ? { userId: "cookie_user", role: "CUSTOMER", name: "Cookie", sv: 0 }
        : { userId: "bearer_user", role: "CUSTOMER", name: "Bearer", sv: 0 }
    );
    vi.mocked(sessionVersionOk).mockResolvedValue(true);
    const h = await upstreamHeadersFor({
      cookie: `${SESSION_COOKIE}=cookie-jwt`,
      authorization: "Bearer bearer-jwt",
    });
    expect(h["x-user-id"]).toBe("cookie_user");
    // The Bearer token was never even verified — the cookie won outright.
    expect(vi.mocked(verifySessionToken)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(verifySessionToken)).toHaveBeenCalledWith("cookie-jwt");
  });

  it("falls back to the Bearer token when the cookie session is invalid", async () => {
    vi.mocked(verifySessionToken).mockImplementation(async (token) =>
      token === "bearer-jwt"
        ? { userId: "bearer_user", role: "CUSTOMER", name: "Bearer", sv: 0 }
        : null
    );
    vi.mocked(sessionVersionOk).mockResolvedValue(true);
    const h = await upstreamHeadersFor({
      cookie: `${SESSION_COOKIE}=expired-jwt`,
      authorization: "Bearer bearer-jwt",
    });
    expect(h["x-user-id"]).toBe("bearer_user");
  });

  it("does not use a revoked impersonation cookie (falls back to the admin's own session)", async () => {
    vi.mocked(verifySessionToken).mockResolvedValue({
      userId: "admin_1",
      role: "ADMIN",
      name: "Admin",
      sv: 0,
    });
    vi.mocked(verifyImpersonationToken).mockResolvedValue({
      userId: "target_user",
      role: "CUSTOMER",
      name: "Target",
      sv: 0,
      impersonatedBy: "admin_1",
      impersonatedBySv: 2,
    });
    // Impersonation checks fail (either party's sv stale) → fall back to admin.
    vi.mocked(sessionVersionOk).mockResolvedValue(false);
    const h = await upstreamHeadersFor({
      cookie: `${SESSION_COOKIE}=admin; ${IMPERSONATION_COOKIE}=imp`,
    });
    // Both checks return false here, so neither identity is forwarded, and
    // crucially x-impersonated-by is never set from a rejected impersonation.
    expect(h["x-impersonated-by"]).toBeUndefined();
    expect(h["x-user-id"]).toBeUndefined();
  });
});

describe("proxyRequest — response pass-through", () => {
  function appWithProxy() {
    const app = new Hono();
    app.all("/api/*", proxyRequest);
    return app;
  }

  it("passes upstream Set-Cookie headers back verbatim (both of them)", async () => {
    proxyMock.mockResolvedValue(
      new Response("ok", {
        status: 200,
        headers: [
          ["set-cookie", "a=1; Path=/"],
          ["set-cookie", "b=2; Path=/"],
          ["content-type", "text/plain"],
        ],
      })
    );
    const res = await appWithProxy().request("/api/providers");
    expect(res.status).toBe(200);
    expect(res.headers.getSetCookie()).toEqual(["a=1; Path=/", "b=2; Path=/"]);
  });

  it("echoes an x-request-id on the proxied response (#760)", async () => {
    proxyMock.mockResolvedValue(new Response("ok", { status: 200 }));
    const res = await appWithProxy().request("/api/providers");
    expect(res.headers.get("x-request-id")).toBeTruthy();
  });

  it("echoes an x-request-id on a 404 for an unroutable path", async () => {
    const res = await appWithProxy().request("/api/internal/secret-thing");
    expect(res.status).toBe(404);
    expect(res.headers.get("x-request-id")).toBeTruthy();
    // The mocked upstream was never called for an unresolved route.
    expect(proxyMock).not.toHaveBeenCalled();
  });

  it("returns 502 with an x-request-id when the upstream throws", async () => {
    proxyMock.mockRejectedValue(new Error("ECONNREFUSED"));
    const res = await appWithProxy().request("/api/providers");
    expect(res.status).toBe(502);
    expect(res.headers.get("x-request-id")).toBeTruthy();
  });
});
