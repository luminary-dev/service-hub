// Route-level tests for social login (#398). The arctic client and id-token
// parsing (../lib/oauth) are mocked so the suite needs no live Google; the
// valuable logic under test is the callback's account-resolution
// (existing-account / link-by-verified-email / new-signup), the state check,
// and the redirect targets. createSession runs for real (signs a JWT with the
// dev-fallback secret and sets the cookie), same as auth.test.ts.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { oauthRoutes } from "./oauth";

const { db } = vi.hoisted(() => ({
  db: {
    account: { findUnique: vi.fn(), create: vi.fn() },
    user: { findUnique: vi.fn(), create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

const { parseGoogleIdToken } = vi.hoisted(() => ({
  parseGoogleIdToken: vi.fn(),
}));

vi.mock("../db", () => ({ db }));
vi.mock("../lib/oauth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/oauth")>();
  return {
    ...actual,
    isGoogleConfigured: () => true,
    getGoogleClient: () => ({
      createAuthorizationURL: () =>
        new URL("https://accounts.google.com/o/oauth2/v2/auth?client_id=x"),
      validateAuthorizationCode: async () => ({ idToken: () => "id-token" }),
    }),
    parseGoogleIdToken,
  };
});

const app = new Hono();
app.route("/api/auth", oauthRoutes);

// Default origin (getOrigin falls back to localhost:3000 with no x-origin).
const ORIGIN = "http://localhost:3000";

function get(path: string, cookie?: string) {
  return app.request(path, {
    headers: cookie ? { cookie } : {},
  });
}

const VERIFIED = {
  providerAccountId: "google-sub-123",
  email: "New.User@Gmail.com",
  emailVerified: true,
  name: "New User",
};

beforeEach(() => {
  vi.resetAllMocks();
  parseGoogleIdToken.mockReturnValue(VERIFIED);
  // Callback interactive transaction: run the callback with a tx double.
  db.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
    fn({
      user: {
        create: vi.fn(async () => ({
          id: "u-new",
          role: "CUSTOMER",
          name: "New User",
          sessionVersion: 0,
        })),
      },
      account: { create: vi.fn(async () => ({})) },
    })
  );
});

describe("GET /api/auth/oauth/google/start", () => {
  it("redirects to Google and sets state + verifier cookies", async () => {
    const res = await get("/api/auth/oauth/google/start");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("accounts.google.com");
    const cookies = res.headers.get("set-cookie") ?? "";
    expect(cookies).toContain("oauth_state=");
    expect(cookies).toContain("oauth_verifier=");
  });

  it("redirects to an error for an unknown provider", async () => {
    const res = await get("/api/auth/oauth/github/start");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(
      `${ORIGIN}/login?error=oauth_unavailable`
    );
  });
});

describe("GET /api/auth/oauth/google/callback", () => {
  const cbUrl = "/api/auth/oauth/google/callback?code=abc&state=s1";
  const goodCookie = "oauth_state=s1; oauth_verifier=v1";

  it("rejects a state mismatch", async () => {
    const res = await get(cbUrl, "oauth_state=DIFFERENT; oauth_verifier=v1");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(`${ORIGIN}/login?error=oauth`);
  });

  it("rejects an unverified provider email", async () => {
    parseGoogleIdToken.mockReturnValue({ ...VERIFIED, emailVerified: false });
    const res = await get(cbUrl, goodCookie);
    expect(res.headers.get("location")).toBe(`${ORIGIN}/login?error=oauth_email`);
  });

  it("logs in a returning user via a linked account", async () => {
    db.account.findUnique.mockResolvedValue({
      user: { id: "u1", role: "CUSTOMER", name: "Ann", sessionVersion: 3 },
    });
    const res = await get(cbUrl, goodCookie);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(`${ORIGIN}/`);
    expect(res.headers.get("set-cookie")).toContain("sh_session=");
    expect(db.user.create).not.toHaveBeenCalled();
  });

  it("auto-links a verified email to an existing password account", async () => {
    db.account.findUnique.mockResolvedValue(null);
    db.user.findUnique.mockResolvedValue({
      id: "u2",
      role: "CUSTOMER",
      name: "Bee",
      sessionVersion: 0,
    });
    db.account.create.mockResolvedValue({});
    const res = await get(cbUrl, goodCookie);
    expect(res.headers.get("location")).toBe(`${ORIGIN}/`);
    // Linked by the lower-cased email, keyed on the Google subject id.
    expect(db.account.create).toHaveBeenCalledWith({
      data: {
        userId: "u2",
        provider: "google",
        providerAccountId: "google-sub-123",
      },
    });
  });

  it("creates a new user and sends them to the role chooser", async () => {
    db.account.findUnique.mockResolvedValue(null);
    db.user.findUnique.mockResolvedValue(null);
    const res = await get(cbUrl, goodCookie);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(`${ORIGIN}/welcome`);
    expect(res.headers.get("set-cookie")).toContain("sh_session=");
    expect(db.$transaction).toHaveBeenCalled();
  });
});
