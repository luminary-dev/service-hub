// Route-level tests for social login (#398, #-facebook). The provider adapters
// (../lib/oauth) are mocked so the suite needs no live Google/Facebook; the
// logic under test is the callback's account-resolution (existing link /
// link-by-verified-email / new signup / no-email placeholder), the state check,
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

const { fetchIdentity } = vi.hoisted(() => ({ fetchIdentity: vi.fn() }));

vi.mock("../db", () => ({ db }));
vi.mock("../lib/oauth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/oauth")>();
  return {
    ...actual,
    // google + facebook resolve to a configured fake adapter; anything else null.
    getAdapter: (name: string) =>
      name === "google" || name === "facebook"
        ? {
            isConfigured: () => true,
            createAuthorizationURL: () =>
              new URL(`https://oauth.example/${name}/authorize?client_id=x`),
            fetchIdentity,
          }
        : null,
  };
});

const app = new Hono();
app.route("/api/auth", oauthRoutes);

const ORIGIN = "http://localhost:3000";

function get(path: string, cookie?: string) {
  return app.request(path, { headers: cookie ? { cookie } : {} });
}

const VERIFIED = {
  providerAccountId: "sub-123",
  email: "New.User@Gmail.com",
  emailVerified: true,
  name: "New User",
};

// Shared tx spies so the placeholder-email assertion can inspect create args.
const txUserCreate = vi.fn();
const txAccountCreate = vi.fn();

beforeEach(() => {
  vi.resetAllMocks();
  fetchIdentity.mockResolvedValue(VERIFIED);
  txUserCreate.mockImplementation(async (args: { data: { name: string } }) => ({
    id: "u-new",
    role: "CUSTOMER",
    name: args.data.name,
    sessionVersion: 0,
  }));
  txAccountCreate.mockResolvedValue({});
  db.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
    fn({ user: { create: txUserCreate }, account: { create: txAccountCreate } })
  );
});

describe("GET /api/auth/oauth/:provider/start", () => {
  it("redirects to the provider and sets state + verifier cookies", async () => {
    const res = await get("/api/auth/oauth/google/start");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("oauth.example/google");
    const cookies = res.headers.get("set-cookie") ?? "";
    expect(cookies).toContain("oauth_state=");
    expect(cookies).toContain("oauth_verifier=");
  });

  it("supports facebook", async () => {
    const res = await get("/api/auth/oauth/facebook/start");
    expect(res.headers.get("location")).toContain("oauth.example/facebook");
  });

  it("redirects to an error for an unknown provider", async () => {
    const res = await get("/api/auth/oauth/twitter/start");
    expect(res.headers.get("location")).toBe(`${ORIGIN}/login?error=oauth_unavailable`);
  });
});

describe("GET /api/auth/oauth/:provider/callback", () => {
  const cbUrl = "/api/auth/oauth/google/callback?code=abc&state=s1";
  const fbCbUrl = "/api/auth/oauth/facebook/callback?code=abc&state=s1";
  const goodCookie = "oauth_state=s1; oauth_verifier=v1";

  it("rejects a state mismatch", async () => {
    const res = await get(cbUrl, "oauth_state=DIFFERENT; oauth_verifier=v1");
    expect(res.headers.get("location")).toBe(`${ORIGIN}/login?error=oauth`);
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

  it("auto-links a verified email to an existing account", async () => {
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
    expect(db.account.create).toHaveBeenCalledWith({
      data: { userId: "u2", provider: "google", providerAccountId: "sub-123" },
    });
  });

  it("creates a new user from a verified email and sends them to /welcome", async () => {
    db.account.findUnique.mockResolvedValue(null);
    db.user.findUnique.mockResolvedValue(null);
    const res = await get(cbUrl, goodCookie);
    expect(res.headers.get("location")).toBe(`${ORIGIN}/welcome`);
    expect(res.headers.get("set-cookie")).toContain("sh_session=");
    expect(txUserCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ email: "new.user@gmail.com" }) })
    );
  });

  it("facebook without an email creates a placeholder-keyed account (no block)", async () => {
    fetchIdentity.mockResolvedValue({
      providerAccountId: "fb-77",
      email: null,
      emailVerified: false,
      name: "Zed",
    });
    db.account.findUnique.mockResolvedValue(null);
    const res = await get(fbCbUrl, goodCookie);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(`${ORIGIN}/welcome`);
    // Non-deliverable placeholder, never marked verified, keyed on the fb id.
    expect(txUserCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: "facebook-fb-77@placeholder.baas.lk",
          emailVerified: null,
        }),
      })
    );
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });
});
