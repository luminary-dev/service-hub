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
    refreshToken: { create: vi.fn() },
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
  it("stores the mobile deep link when client=mobile with an allowed scheme", async () => {
    const res = await get(
      "/api/auth/oauth/google/start?client=mobile&redirect=baaslk://auth"
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("set-cookie")).toContain("oauth_mobile=baaslk");
  });

  it("ignores a non-app redirect scheme (no token leak)", async () => {
    const res = await get(
      "/api/auth/oauth/google/start?client=mobile&redirect=evil://steal"
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("set-cookie") ?? "").not.toContain("oauth_mobile");
  });

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

  it("treats a provider error (cancelled consent) as a quiet return, not a failure", async () => {
    const res = await get(
      "/api/auth/oauth/google/callback?error=access_denied&state=s1",
      goodCookie
    );
    expect(res.status).toBe(302);
    // Back to /login with no scary error banner (#431).
    expect(res.headers.get("location")).toBe(`${ORIGIN}/login`);
  });

  it("mobile flow returns tokens to the app deep link, not a cookie", async () => {
    db.account.findUnique.mockResolvedValue({
      user: { id: "u1", role: "CUSTOMER", name: "Nimal", sessionVersion: 0 },
    });
    db.refreshToken.create.mockResolvedValue({});
    const res = await get(cbUrl, `${goodCookie}; oauth_mobile=baaslk://auth`);
    expect(res.status).toBe(302);
    const loc = res.headers.get("location")!;
    expect(loc).toMatch(/^baaslk:\/\/auth\?/);
    expect(loc).toContain("accessToken=");
    expect(loc).toContain("refreshToken=");
    expect(loc).toContain("expiresIn=");
    // No web session cookie is set for a mobile handoff.
    expect(res.headers.get("set-cookie") ?? "").not.toContain("sh_session=");
    expect(db.refreshToken.create).toHaveBeenCalledOnce();
  });

  it("mobile flow sends errors to the deep link too", async () => {
    const res = await get(
      "/api/auth/oauth/google/callback?error=access_denied&state=s1",
      `${goodCookie}; oauth_mobile=baaslk://auth`
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("baaslk://auth?error=cancelled");
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

  it("refuses to sign in a locked account (no session), matching password login (#641)", async () => {
    db.account.findUnique.mockResolvedValue({
      user: {
        id: "u1",
        role: "CUSTOMER",
        name: "Ann",
        sessionVersion: 3,
        // Locked well into the future (an admin lock or an active failed-login
        // window) — the OAuth path must honor it just like /login does.
        lockedUntil: new Date(Date.now() + 60_000),
      },
    });
    const res = await get(cbUrl, goodCookie);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(`${ORIGIN}/login?error=oauth_locked`);
    // Crucially, no session cookie was minted for the locked account.
    expect(res.headers.get("set-cookie") ?? "").not.toContain("sh_session=");
  });

  it("signs in when lockedUntil is in the past (window expired)", async () => {
    db.account.findUnique.mockResolvedValue({
      user: {
        id: "u1",
        role: "CUSTOMER",
        name: "Ann",
        sessionVersion: 3,
        lockedUntil: new Date(Date.now() - 60_000),
      },
    });
    const res = await get(cbUrl, goodCookie);
    expect(res.headers.get("location")).toBe(`${ORIGIN}/`);
    expect(res.headers.get("set-cookie")).toContain("sh_session=");
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

  // #635: a Facebook email is unverified (the Graph API exposes no verification
  // signal), so it must never auto-link to a PRE-EXISTING account — that was an
  // account-takeover vector.
  it("refuses to link an UNVERIFIED (facebook) email to an existing account", async () => {
    fetchIdentity.mockResolvedValue({
      providerAccountId: "fb-88",
      email: "victim@example.com",
      emailVerified: false,
      name: "Attacker",
    });
    db.account.findUnique.mockResolvedValue(null);
    db.user.findUnique.mockResolvedValue({
      id: "victim-1",
      role: "CUSTOMER",
      name: "Victim",
      sessionVersion: 0,
      passwordHash: "hash",
    });
    const res = await get(fbCbUrl, goodCookie);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(`${ORIGIN}/login?error=oauth_email`);
    // No link created, no session minted for the victim's account.
    expect(db.account.create).not.toHaveBeenCalled();
    expect(res.headers.get("set-cookie") ?? "").not.toContain("sh_session=");
  });

  it("creates a new UNVERIFIED account from a facebook email with no collision", async () => {
    fetchIdentity.mockResolvedValue({
      providerAccountId: "fb-99",
      email: "Fresh.Fb@Example.com",
      emailVerified: false,
      name: "Fresh",
    });
    db.account.findUnique.mockResolvedValue(null);
    db.user.findUnique.mockResolvedValue(null);
    const res = await get(fbCbUrl, goodCookie);
    expect(res.headers.get("location")).toBe(`${ORIGIN}/welcome`);
    expect(res.headers.get("set-cookie")).toContain("sh_session=");
    // Real (lowercased) email is kept, but never stamped verified.
    expect(txUserCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: "fresh.fb@example.com",
          emailVerified: null,
        }),
      })
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
