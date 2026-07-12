// Route-level tests for the auth handlers, focused on the highest-risk auth
// surface identified in #256: the password-reset and email-verification token
// lifecycles (single-use consumption, expiry, sessionVersion bump), plus
// change-password / logout-all / delete-account.
//
// The Prisma client and the S2S helpers (verification emails, peer erase,
// provider lookup) are mocked so the suite is deterministic and needs no live
// DB or network. createSession/destroySession run for real — they only sign a
// JWT with the dev-fallback secret and set a cookie.
import { beforeEach, describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";
import { Hono } from "hono";
import { authRoutes } from "./auth";
import { hashToken } from "../lib/tokens";
import { MAX_FAILED_LOGINS, LOCKOUT_MS } from "../lib/lockout";
import { sendVerificationEmail, sendPasswordResetEmail } from "../lib/verification";
import { eraseUserData } from "../lib/erase";
import {
  createProviderProfile,
  deactivateProviderProfile,
  getProviderIdByUser,
  reactivateProviderProfile,
} from "../lib/providers";

// Stateful-enough Prisma double: canned per-test return values + call assertions
// (mirrors the vi.fn()/stubFetch style already used in providers.test.ts).
const { db } = vi.hoisted(() => ({
  db: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    emailVerificationToken: {
      findUnique: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    passwordResetToken: {
      findUnique: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    accountDeletion: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("../db", () => ({ db }));
vi.mock("../lib/verification", () => ({
  sendVerificationEmail: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
}));
vi.mock("../lib/erase", () => ({ eraseUserData: vi.fn() }));
vi.mock("../lib/providers", () => ({
  getProviderIdByUser: vi.fn(async () => null),
  createProviderProfile: vi.fn(),
  deactivateProviderProfile: vi.fn(),
  reactivateProviderProfile: vi.fn(),
}));
vi.mock("../lib/audit", () => ({ logAudit: vi.fn() }));

// Mount the auth routes on a bare app — no gateway/internal-secret middleware,
// so we drive the handlers directly. Auth is simulated with the x-user-* headers
// the gateway would forward.
const app = new Hono();
app.route("/api/auth", authRoutes);

function post(
  path: string,
  body: unknown,
  headers: Record<string, string> = {}
) {
  return app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

// Signed-in caller: the gateway forwards identity as x-user-* headers.
const AUTH_HEADERS = {
  "x-user-id": "u1",
  "x-user-role": "CUSTOMER",
  "x-user-name": "Test User",
};

// Passes passwordSchema (>=10 chars, not on the common-password deny-list).
const STRONG_PASSWORD = "new-strong-pass-9";
const CURRENT_PASSWORD = "current-pass-1";
const currentHash = bcrypt.hashSync(CURRENT_PASSWORD, 10);

const future = () => new Date(Date.now() + 60_000);
const past = () => new Date(Date.now() - 60_000);

beforeEach(() => {
  vi.resetAllMocks();
  // Defaults: a transaction runs its operations; token cleanups resolve.
  db.$transaction.mockImplementation(async (ops: unknown[]) =>
    Promise.all(ops as Promise<unknown>[])
  );
  db.emailVerificationToken.deleteMany.mockResolvedValue({ count: 0 });
  db.emailVerificationToken.delete.mockResolvedValue({});
  db.passwordResetToken.deleteMany.mockResolvedValue({ count: 0 });
  db.passwordResetToken.delete.mockResolvedValue({});
  db.accountDeletion.create.mockResolvedValue({});
  db.user.delete.mockResolvedValue({});
  db.user.update.mockResolvedValue({
    id: "u1",
    role: "CUSTOMER",
    name: "Test User",
    sessionVersion: 1,
  });
  vi.mocked(sendVerificationEmail).mockResolvedValue(undefined);
  vi.mocked(sendPasswordResetEmail).mockResolvedValue(undefined);
  vi.mocked(eraseUserData).mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// POST /api/auth/verify-email
// ---------------------------------------------------------------------------
describe("POST /api/auth/verify-email", () => {
  it("400s on a missing token", async () => {
    const res = await post("/api/auth/verify-email", {});
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid" });
  });

  it("400s (expired) when no token record exists", async () => {
    db.emailVerificationToken.findUnique.mockResolvedValue(null);
    const res = await post("/api/auth/verify-email", { token: "abc" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "expired" });
    // Nothing to delete when the token was never found.
    expect(db.emailVerificationToken.delete).not.toHaveBeenCalled();
  });

  it("looks the token up by its hash, never the raw value", async () => {
    db.emailVerificationToken.findUnique.mockResolvedValue(null);
    await post("/api/auth/verify-email", { token: "raw-token" });
    expect(db.emailVerificationToken.findUnique).toHaveBeenCalledWith({
      where: { tokenHash: hashToken("raw-token") },
    });
  });

  it("400s and deletes the record when the token has expired", async () => {
    db.emailVerificationToken.findUnique.mockResolvedValue({
      id: "t1",
      userId: "u1",
      expiresAt: past(),
    });
    const res = await post("/api/auth/verify-email", { token: "abc" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "expired" });
    expect(db.emailVerificationToken.delete).toHaveBeenCalledWith({
      where: { id: "t1" },
    });
  });

  it("verifies the email and consumes every token for the user (single-use)", async () => {
    db.emailVerificationToken.findUnique.mockResolvedValue({
      id: "t1",
      userId: "u1",
      expiresAt: future(),
    });
    const res = await post("/api/auth/verify-email", { token: "abc" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(db.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "u1" },
        data: { emailVerified: expect.any(Date) },
      })
    );
    expect(db.emailVerificationToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: "u1" },
    });
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/resend-verification
// ---------------------------------------------------------------------------
describe("POST /api/auth/resend-verification", () => {
  it("401s an unauthenticated request", async () => {
    const res = await post("/api/auth/resend-verification", {});
    expect(res.status).toBe(401);
    expect(sendVerificationEmail).not.toHaveBeenCalled();
  });

  it("401s when the user no longer exists", async () => {
    db.user.findUnique.mockResolvedValue(null);
    const res = await post("/api/auth/resend-verification", {}, AUTH_HEADERS);
    expect(res.status).toBe(401);
  });

  it("is a no-op for an already-verified user", async () => {
    db.user.findUnique.mockResolvedValue({
      id: "u1",
      email: "a@b.lk",
      emailVerified: new Date(),
    });
    const res = await post("/api/auth/resend-verification", {}, AUTH_HEADERS);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, alreadyVerified: true });
    expect(sendVerificationEmail).not.toHaveBeenCalled();
  });

  it("sends a verification email for an unverified user", async () => {
    db.user.findUnique.mockResolvedValue({
      id: "u1",
      email: "a@b.lk",
      emailVerified: null,
    });
    const res = await post("/api/auth/resend-verification", {}, AUTH_HEADERS);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(sendVerificationEmail).toHaveBeenCalledWith(
      "u1",
      "a@b.lk",
      expect.any(String),
      "en"
    );
  });

  it("500s when the email send throws", async () => {
    db.user.findUnique.mockResolvedValue({
      id: "u1",
      email: "a@b.lk",
      emailVerified: null,
    });
    vi.mocked(sendVerificationEmail).mockRejectedValue(new Error("down"));
    const res = await post("/api/auth/resend-verification", {}, AUTH_HEADERS);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      error: "Could not send verification email.",
    });
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/forgot-password (anti-enumeration: always { ok: true })
// ---------------------------------------------------------------------------
describe("POST /api/auth/forgot-password", () => {
  it("returns { ok: true } for an invalid email without sending", async () => {
    const res = await post("/api/auth/forgot-password", { email: "not-email" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it("returns { ok: true } for an unknown email without sending", async () => {
    db.user.findUnique.mockResolvedValue(null);
    const res = await post("/api/auth/forgot-password", { email: "a@b.lk" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it("sends a reset email for a known email (same { ok: true } response)", async () => {
    db.user.findUnique.mockResolvedValue({ id: "u1", email: "a@b.lk" });
    const res = await post("/api/auth/forgot-password", { email: "a@b.lk" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(sendPasswordResetEmail).toHaveBeenCalledWith(
      "u1",
      "a@b.lk",
      expect.any(String),
      "en"
    );
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/reset-password
// ---------------------------------------------------------------------------
// Email case-insensitivity (#431): schema normalization means a mixed-case /
// padded address resolves to the same account on register and login.
describe("email normalization", () => {
  it("stores a lower-cased email on register", async () => {
    db.user.findUnique.mockResolvedValue(null);
    db.user.create.mockResolvedValue({
      id: "u1",
      name: "Cased User",
      role: "CUSTOMER",
      sessionVersion: 0,
    });
    const res = await post("/api/auth/register", {
      role: "CUSTOMER",
      name: "Cased User",
      email: "  Mixed@Case.COM ",
      phone: "0771234567",
      password: STRONG_PASSWORD,
    });
    expect(res.status).toBe(200);
    expect(db.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ email: "mixed@case.com" }),
      })
    );
  });

  it("looks up a lower-cased email on login", async () => {
    db.user.findUnique.mockResolvedValue(null);
    const res = await post("/api/auth/login", {
      email: "USER@Example.COM",
      password: "whatever",
    });
    expect(res.status).toBe(401);
    expect(db.user.findUnique).toHaveBeenCalledWith({
      where: { email: "user@example.com" },
    });
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/login — failed-login lockout counter (security hardening)
// ---------------------------------------------------------------------------
// The counter must advance via an atomic DB increment, never a
// read-modify-write from a pre-read snapshot: concurrent wrong-password
// attempts would otherwise both read N and both write N+1, so a parallel
// guesser advances the counter by 1 instead of N and reaches the lockout
// threshold far more slowly than intended.
describe("POST /api/auth/login (lockout counter)", () => {
  const loginUser = {
    id: "u1",
    email: "a@b.lk",
    name: "Test User",
    role: "CUSTOMER",
    passwordHash: currentHash,
    failedLogins: 0,
    lockedUntil: null,
    sessionVersion: 0,
    avatarUrl: null,
  };

  it("increments the failed-login counter atomically on a wrong password", async () => {
    db.user.findUnique.mockResolvedValue({ ...loginUser, failedLogins: 2 });
    // The atomic increment returns the resulting count; below threshold → no lock.
    db.user.update.mockResolvedValueOnce({ failedLogins: 3 });

    const res = await post("/api/auth/login", {
      email: "a@b.lk",
      password: "wrong-password",
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Invalid email or password" });

    // The failure is recorded as an atomic increment, not an overwrite.
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { failedLogins: { increment: 1 } },
      select: { failedLogins: true },
    });
    // Below the threshold: no lock is applied (only the increment ran).
    expect(db.user.update).toHaveBeenCalledTimes(1);
  });

  it("locks the account once the incremented count reaches the threshold", async () => {
    db.user.findUnique.mockResolvedValue({
      ...loginUser,
      failedLogins: MAX_FAILED_LOGINS - 1,
    });
    // The increment tips the counter to the threshold.
    db.user.update.mockResolvedValueOnce({ failedLogins: MAX_FAILED_LOGINS });
    db.user.update.mockResolvedValueOnce({});

    const res = await post("/api/auth/login", {
      email: "a@b.lk",
      password: "wrong-password",
    });
    expect(res.status).toBe(401);

    // First call: atomic increment. Second call: set the lock window derived
    // from the resulting count.
    expect(db.user.update).toHaveBeenNthCalledWith(1, {
      where: { id: "u1" },
      data: { failedLogins: { increment: 1 } },
      select: { failedLogins: true },
    });
    const lockCall = db.user.update.mock.calls[1][0] as {
      where: { id: string };
      data: { lockedUntil: Date };
    };
    expect(lockCall.where).toEqual({ id: "u1" });
    expect(lockCall.data.lockedUntil).toBeInstanceOf(Date);
    expect(lockCall.data.lockedUntil.getTime()).toBeGreaterThan(
      Date.now() + LOCKOUT_MS - 5_000
    );
  });

  it("returns the uniform 401 (no lock) for a locked account without touching the counter", async () => {
    db.user.findUnique.mockResolvedValue({
      ...loginUser,
      failedLogins: MAX_FAILED_LOGINS,
      lockedUntil: new Date(Date.now() + LOCKOUT_MS),
    });
    const res = await post("/api/auth/login", {
      email: "a@b.lk",
      password: CURRENT_PASSWORD,
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Invalid email or password" });
    // Locked branch does not increment or reset the counter.
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("resets the counter and lock on a successful login", async () => {
    db.user.findUnique.mockResolvedValue({
      ...loginUser,
      failedLogins: 3,
      lockedUntil: null,
    });
    db.user.update.mockResolvedValue({});

    const res = await post("/api/auth/login", {
      email: "a@b.lk",
      password: CURRENT_PASSWORD,
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      user: { id: "u1", name: "Test User", role: "CUSTOMER" },
      providerId: null,
    });
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { failedLogins: 0, lockedUntil: null },
    });
  });
});

describe("POST /api/auth/reset-password", () => {
  it("400s when the new password fails the policy", async () => {
    const res = await post("/api/auth/reset-password", {
      token: "abc",
      password: "short",
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Password must be at least 6 characters.",
    });
    expect(db.passwordResetToken.findUnique).not.toHaveBeenCalled();
  });

  it("400s when the token is unknown", async () => {
    db.passwordResetToken.findUnique.mockResolvedValue(null);
    const res = await post("/api/auth/reset-password", {
      token: "abc",
      password: STRONG_PASSWORD,
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "This reset link is invalid or has expired.",
    });
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("400s and deletes the record when the token has expired", async () => {
    db.passwordResetToken.findUnique.mockResolvedValue({
      id: "t1",
      userId: "u1",
      expiresAt: past(),
    });
    const res = await post("/api/auth/reset-password", {
      token: "abc",
      password: STRONG_PASSWORD,
    });
    expect(res.status).toBe(400);
    expect(db.passwordResetToken.delete).toHaveBeenCalledWith({
      where: { id: "t1" },
    });
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("resets the password, bumps sessionVersion, and consumes all reset tokens", async () => {
    db.passwordResetToken.findUnique.mockResolvedValue({
      id: "t1",
      userId: "u1",
      expiresAt: future(),
    });
    const res = await post("/api/auth/reset-password", {
      token: "abc",
      password: STRONG_PASSWORD,
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    const updateArg = db.user.update.mock.calls[0][0] as {
      where: { id: string };
      data: { passwordHash: string; sessionVersion: { increment: number } };
    };
    expect(updateArg.where).toEqual({ id: "u1" });
    expect(updateArg.data.sessionVersion).toEqual({ increment: 1 });
    // A real bcrypt hash of the new password, never the plaintext.
    expect(updateArg.data.passwordHash).not.toBe(STRONG_PASSWORD);
    expect(await bcrypt.compare(STRONG_PASSWORD, updateArg.data.passwordHash)).toBe(
      true
    );
    // Single-use: every reset token for the user is deleted.
    expect(db.passwordResetToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: "u1" },
    });
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/change-password
// ---------------------------------------------------------------------------
describe("POST /api/auth/change-password", () => {
  it("401s an unauthenticated request", async () => {
    const res = await post("/api/auth/change-password", {
      currentPassword: CURRENT_PASSWORD,
      newPassword: STRONG_PASSWORD,
    });
    expect(res.status).toBe(401);
  });

  it("400s when the new password fails the policy", async () => {
    const res = await post(
      "/api/auth/change-password",
      { currentPassword: CURRENT_PASSWORD, newPassword: "short" },
      AUTH_HEADERS
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "New password must be between 6 and 100 characters.",
    });
  });

  it("401s when the user no longer exists", async () => {
    db.user.findUnique.mockResolvedValue(null);
    const res = await post(
      "/api/auth/change-password",
      { currentPassword: CURRENT_PASSWORD, newPassword: STRONG_PASSWORD },
      AUTH_HEADERS
    );
    expect(res.status).toBe(401);
  });

  it("400s when the current password is wrong", async () => {
    db.user.findUnique.mockResolvedValue({
      id: "u1",
      role: "CUSTOMER",
      name: "Test User",
      passwordHash: currentHash,
    });
    const res = await post(
      "/api/auth/change-password",
      { currentPassword: "wrong-password", newPassword: STRONG_PASSWORD },
      AUTH_HEADERS
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Current password is incorrect.",
    });
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("changes the password, bumps sessionVersion, and clears reset tokens", async () => {
    db.user.findUnique.mockResolvedValue({
      id: "u1",
      role: "CUSTOMER",
      name: "Test User",
      passwordHash: currentHash,
    });
    const res = await post(
      "/api/auth/change-password",
      { currentPassword: CURRENT_PASSWORD, newPassword: STRONG_PASSWORD },
      AUTH_HEADERS
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    const updateArg = db.user.update.mock.calls[0][0] as {
      data: { passwordHash: string; sessionVersion: { increment: number } };
    };
    expect(updateArg.data.sessionVersion).toEqual({ increment: 1 });
    expect(await bcrypt.compare(STRONG_PASSWORD, updateArg.data.passwordHash)).toBe(
      true
    );
    // A pending reset link is invalidated too.
    expect(db.passwordResetToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: "u1" },
    });
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/logout-all
// ---------------------------------------------------------------------------
describe("POST /api/auth/logout-all", () => {
  it("401s an unauthenticated request", async () => {
    const res = await post("/api/auth/logout-all", {});
    expect(res.status).toBe(401);
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("401s when the sessionVersion bump fails (unknown user)", async () => {
    db.user.update.mockRejectedValue(new Error("not found"));
    const res = await post("/api/auth/logout-all", {}, AUTH_HEADERS);
    expect(res.status).toBe(401);
  });

  it("bumps sessionVersion to revoke every session, then re-issues this one", async () => {
    db.user.update.mockResolvedValue({
      id: "u1",
      role: "CUSTOMER",
      name: "Test User",
      sessionVersion: 2,
    });
    const res = await post("/api/auth/logout-all", {}, AUTH_HEADERS);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { sessionVersion: { increment: 1 } },
    });
    // A fresh session cookie keeps the requester signed in.
    expect(res.headers.get("set-cookie")).toContain("sh_session=");
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/complete-provider (#398)
// ---------------------------------------------------------------------------
describe("POST /api/auth/complete-provider", () => {
  const providerBody = {
    phone: "0771234567",
    category: "electrician",
    headline: "Experienced electrician",
    bio: "Twenty-plus characters of provider bio for validation.",
    district: "Colombo",
    city: "Colombo",
    experience: 5,
    services: [{ title: "Wiring", price: 1500, priceType: "FIXED" }],
  };

  it("401s an unauthenticated request", async () => {
    const res = await post("/api/auth/complete-provider", providerBody);
    expect(res.status).toBe(401);
  });

  it("creates the profile, flips role to PROVIDER, and re-issues the session", async () => {
    db.user.findUnique.mockResolvedValue({
      id: "u1",
      email: "a@b.lk",
      name: "Ann",
      role: "CUSTOMER",
    });
    vi.mocked(createProviderProfile).mockResolvedValue("prov-1");
    db.user.update.mockResolvedValue({
      id: "u1",
      name: "Ann",
      role: "PROVIDER",
      sessionVersion: 1,
    });

    const res = await post("/api/auth/complete-provider", providerBody, AUTH_HEADERS);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      user: { id: "u1", name: "Ann", role: "PROVIDER" },
      providerId: "prov-1",
    });
    // Role flip revokes the old CUSTOMER token; a fresh cookie keeps them in.
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      // slPhone normalizes the input to E.164 before it reaches the handler.
      data: { role: "PROVIDER", phone: "+94771234567", sessionVersion: { increment: 1 } },
    });
    expect(res.headers.get("set-cookie")).toContain("sh_session=");
  });

  it("409s an account that is already a provider", async () => {
    db.user.findUnique.mockResolvedValue({
      id: "u1",
      email: "a@b.lk",
      name: "Ann",
      role: "PROVIDER",
    });
    const res = await post("/api/auth/complete-provider", providerBody, AUTH_HEADERS);
    expect(res.status).toBe(409);
    expect(createProviderProfile).not.toHaveBeenCalled();
  });

  it("re-upgrade: reactivates the existing profile instead of recreating it", async () => {
    // A previously-closed provider (#403) re-upgrading: role is CUSTOMER again
    // but the (suspended) profile still exists, so complete-provider must
    // reactivate it rather than call createProviderProfile.
    db.user.findUnique.mockResolvedValue({
      id: "u1",
      email: "a@b.lk",
      name: "Ann",
      role: "CUSTOMER",
    });
    vi.mocked(getProviderIdByUser).mockResolvedValue("prov-1");
    db.user.update.mockResolvedValue({
      id: "u1",
      name: "Ann",
      role: "PROVIDER",
      sessionVersion: 3,
    });

    const res = await post("/api/auth/complete-provider", providerBody, AUTH_HEADERS);
    expect(res.status).toBe(200);
    expect(reactivateProviderProfile).toHaveBeenCalledWith("u1");
    expect(createProviderProfile).not.toHaveBeenCalled();
  });

  it("502s the re-upgrade when reactivation fails (role not flipped)", async () => {
    db.user.findUnique.mockResolvedValue({
      id: "u1",
      email: "a@b.lk",
      name: "Ann",
      role: "CUSTOMER",
    });
    vi.mocked(getProviderIdByUser).mockResolvedValue("prov-1");
    vi.mocked(reactivateProviderProfile).mockRejectedValue(new Error("peer down"));

    const res = await post("/api/auth/complete-provider", providerBody, AUTH_HEADERS);
    expect(res.status).toBe(502);
    expect(db.user.update).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/leave-provider (#403)
// ---------------------------------------------------------------------------
describe("POST /api/auth/leave-provider", () => {
  const PROVIDER_HEADERS = { ...AUTH_HEADERS, "x-user-role": "PROVIDER" };

  it("hides the profile, flips role to CUSTOMER, and re-issues the session", async () => {
    db.user.findUnique.mockResolvedValue({ id: "u1", name: "Ann", role: "PROVIDER" });
    vi.mocked(deactivateProviderProfile).mockResolvedValue();
    db.user.update.mockResolvedValue({
      id: "u1",
      name: "Ann",
      role: "CUSTOMER",
      sessionVersion: 2,
    });

    const res = await post("/api/auth/leave-provider", {}, PROVIDER_HEADERS);
    expect(res.status).toBe(200);
    expect(deactivateProviderProfile).toHaveBeenCalledWith("u1");
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { role: "CUSTOMER", sessionVersion: { increment: 1 } },
    });
    expect(res.headers.get("set-cookie")).toContain("sh_session=");
  });

  it("409s an account that is not a provider", async () => {
    db.user.findUnique.mockResolvedValue({ id: "u1", name: "Ann", role: "CUSTOMER" });
    const res = await post("/api/auth/leave-provider", {}, AUTH_HEADERS);
    expect(res.status).toBe(409);
    expect(deactivateProviderProfile).not.toHaveBeenCalled();
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("502s and leaves the role untouched when provider-service is down", async () => {
    db.user.findUnique.mockResolvedValue({ id: "u1", name: "Ann", role: "PROVIDER" });
    vi.mocked(deactivateProviderProfile).mockRejectedValue(new Error("peer down"));

    const res = await post("/api/auth/leave-provider", {}, PROVIDER_HEADERS);
    expect(res.status).toBe(502);
    expect(db.user.update).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/delete-account
// ---------------------------------------------------------------------------
describe("POST /api/auth/delete-account", () => {
  it("401s an unauthenticated request", async () => {
    const res = await post("/api/auth/delete-account", {
      password: CURRENT_PASSWORD,
    });
    expect(res.status).toBe(401);
  });

  it("400s a password account when the password is missing", async () => {
    db.user.findUnique.mockResolvedValue({
      id: "u1",
      email: "a@b.lk",
      role: "CUSTOMER",
      passwordHash: currentHash,
    });
    const res = await post("/api/auth/delete-account", {}, AUTH_HEADERS);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Incorrect password." });
    expect(eraseUserData).not.toHaveBeenCalled();
  });

  // Social-only accounts (#398) have no password; the valid session is the
  // re-auth, so an empty body deletes.
  it("lets a social-only account (no password) delete with just a session", async () => {
    db.user.findUnique.mockResolvedValue({
      id: "u1",
      email: "a@b.lk",
      role: "CUSTOMER",
      passwordHash: null,
    });
    const res = await post("/api/auth/delete-account", {}, AUTH_HEADERS);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(eraseUserData).toHaveBeenCalledWith("u1", null);
    expect(db.user.delete).toHaveBeenCalledWith({ where: { id: "u1" } });
  });

  it("401s when the user no longer exists", async () => {
    db.user.findUnique.mockResolvedValue(null);
    const res = await post(
      "/api/auth/delete-account",
      { password: CURRENT_PASSWORD },
      AUTH_HEADERS
    );
    expect(res.status).toBe(401);
  });

  it("400s when the password is incorrect", async () => {
    db.user.findUnique.mockResolvedValue({
      id: "u1",
      email: "a@b.lk",
      role: "CUSTOMER",
      passwordHash: currentHash,
    });
    const res = await post(
      "/api/auth/delete-account",
      { password: "wrong-password" },
      AUTH_HEADERS
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Incorrect password." });
    expect(eraseUserData).not.toHaveBeenCalled();
  });

  it("502s and deletes nothing locally when a peer erase fails", async () => {
    db.user.findUnique.mockResolvedValue({
      id: "u1",
      email: "a@b.lk",
      role: "CUSTOMER",
      passwordHash: currentHash,
    });
    vi.mocked(eraseUserData).mockRejectedValue(new Error("peer down"));
    const res = await post(
      "/api/auth/delete-account",
      { password: CURRENT_PASSWORD },
      AUTH_HEADERS
    );
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "Upstream service unavailable" });
    // Local rows survive so a retry can finish the job.
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("erases peers, then records the deletion and removes the local user", async () => {
    db.user.findUnique.mockResolvedValue({
      id: "u1",
      email: "a@b.lk",
      role: "CUSTOMER",
      passwordHash: currentHash,
    });
    const res = await post(
      "/api/auth/delete-account",
      { password: CURRENT_PASSWORD },
      AUTH_HEADERS
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(eraseUserData).toHaveBeenCalledWith("u1", null);
    expect(db.accountDeletion.create).toHaveBeenCalledWith({
      data: { userId: "u1", email: "a@b.lk", role: "CUSTOMER" },
    });
    expect(db.user.delete).toHaveBeenCalledWith({ where: { id: "u1" } });
  });
});
