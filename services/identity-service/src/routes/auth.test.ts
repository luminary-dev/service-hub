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
import { Prisma } from "@prisma/client";
import { Hono } from "hono";
import { authRoutes } from "./auth";
import { hashToken } from "../lib/tokens";
import { MAX_FAILED_LOGINS, LOCKOUT_MS } from "../lib/lockout";
import {
  sendAccountExistsEmail,
  sendVerificationEmail,
  sendPasswordResetEmail,
} from "../lib/verification";
import { eraseUserData } from "../lib/erase";
import {
  createProviderProfile,
  deactivateProviderProfile,
  eraseProviderProfile,
  getProviderIdByUser,
  ProviderAdminSuspendedError,
  reactivateProviderProfile,
  resolveProviderIdForErase,
  syncContactToProvider,
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
  sendAccountExistsEmail: vi.fn(),
}));
vi.mock("../lib/erase", () => ({ eraseUserData: vi.fn() }));
vi.mock("../lib/providers", () => ({
  // Stand-in for the real class: the route's instanceof (#550) and the test's
  // throw both resolve to this same mocked export.
  ProviderAdminSuspendedError: class ProviderAdminSuspendedError extends Error {},
  getProviderIdByUser: vi.fn(async () => null),
  createProviderProfile: vi.fn(),
  deactivateProviderProfile: vi.fn(),
  eraseProviderProfile: vi.fn(),
  reactivateProviderProfile: vi.fn(),
  resolveProviderIdForErase: vi.fn(async () => null),
  syncContactToProvider: vi.fn(),
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
  vi.mocked(sendAccountExistsEmail).mockResolvedValue(undefined);
  vi.mocked(eraseUserData).mockResolvedValue(undefined);
  // Default: the compensating provider-erase (#359) resolves so register's
  // best-effort `.catch()` has a promise to chain. Per-test overrides reject it.
  vi.mocked(eraseProviderProfile).mockResolvedValue(undefined);
  // Default: the caller has no provider profile. Per-test overrides set an id
  // (provider deletion) or reject (transient S2S failure).
  vi.mocked(resolveProviderIdForErase).mockResolvedValue(null);
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
      error: "Password must be at least 10 characters.",
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
      error: "New password must be between 10 and 100 characters.",
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
// POST /api/auth/register — account-enumeration hardening (#373)
// ---------------------------------------------------------------------------
// A taken email must be indistinguishable from a fresh one: the endpoint returns
// the same generic { ok: true } and no 409, creates no duplicate user, and mails
// the real owner an out-of-band "account already exists" notice instead. A fresh
// email keeps the normal path (create + session + verification email).
describe("POST /api/auth/register (anti-enumeration #373)", () => {
  const customerBody = {
    role: "CUSTOMER",
    name: "New User",
    email: "taken@b.lk",
    password: STRONG_PASSWORD,
    phone: "0771234567",
  };

  it("returns the generic success for a taken email without creating a duplicate", async () => {
    db.user.findUnique.mockResolvedValue({ id: "existing", email: "taken@b.lk" });

    const res = await post("/api/auth/register", customerBody);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    // No duplicate row, and no auto-login for a request that isn't the owner.
    expect(db.user.create).not.toHaveBeenCalled();
    expect(res.headers.get("set-cookie")).toBeNull();
    // The real owner is notified out-of-band; the normal verification mail is not.
    expect(sendAccountExistsEmail).toHaveBeenCalledWith(
      "taken@b.lk",
      expect.any(String),
      "en"
    );
    expect(sendVerificationEmail).not.toHaveBeenCalled();
  });

  it("returns the same generic success when the unique-constraint race is lost (P2002)", async () => {
    // Two concurrent signups pass the findUnique fast-path; the loser hits the
    // unique constraint. That must land on the same anti-enumeration response.
    db.user.findUnique.mockResolvedValue(null);
    db.user.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "test",
      })
    );

    const res = await post("/api/auth/register", customerBody);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(sendAccountExistsEmail).toHaveBeenCalledWith(
      "taken@b.lk",
      expect.any(String),
      "en"
    );
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("runs the normal registration path for a brand-new email", async () => {
    db.user.findUnique.mockResolvedValue(null);
    db.user.create.mockResolvedValue({
      id: "u-new",
      email: "taken@b.lk",
      name: "New User",
      role: "CUSTOMER",
      sessionVersion: 0,
      avatarUrl: null,
    });

    const res = await post("/api/auth/register", customerBody);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      user: { id: "u-new", name: "New User", role: "CUSTOMER" },
      providerId: null,
    });
    expect(db.user.create).toHaveBeenCalled();
    // Normal path: session cookie issued, verification mail sent, no exists-mail.
    expect(res.headers.get("set-cookie")).toContain("sh_session=");
    expect(sendVerificationEmail).toHaveBeenCalledWith(
      "u-new",
      "taken@b.lk",
      expect.any(String),
      "en"
    );
    expect(sendAccountExistsEmail).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/register — provider orphan compensation (#359)
// ---------------------------------------------------------------------------
describe("POST /api/auth/register (provider compensation)", () => {
  const registerBody = {
    role: "PROVIDER",
    name: "Ann Provider",
    email: "ann@b.lk",
    password: STRONG_PASSWORD,
    phone: "0771234567",
    category: "electrician",
    headline: "Experienced electrician",
    bio: "Twenty-plus characters of provider bio for validation.",
    district: "Colombo",
    city: "Colombo",
    experience: 5,
    services: [{ title: "Wiring", price: 1500, priceType: "FIXED" }],
  };

  it("502s and deletes the just-created user when provider creation fails", async () => {
    db.user.findUnique.mockResolvedValue(null);
    db.user.create.mockResolvedValue({
      id: "u1",
      email: "ann@b.lk",
      name: "Ann Provider",
      role: "PROVIDER",
      sessionVersion: 0,
    });
    vi.mocked(createProviderProfile).mockRejectedValue(new Error("peer down"));

    const res = await post("/api/auth/register", registerBody);
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "Upstream service unavailable" });
    // Compensation removes the orphaned user (no profile ⇒ useless row).
    expect(db.user.delete).toHaveBeenCalledWith({ where: { id: "u1" } });
  });

  // #359: the provider-create throwing is ambiguous — provider-service may have
  // committed the Provider row and only lost its *response* (a timeout).
  // Deleting the user alone would then leave that Provider orphaned with a
  // dangling userId, so compensation must also fire the idempotent erase.
  it("erases the possibly-committed provider before deleting the user (lost-response path)", async () => {
    db.user.findUnique.mockResolvedValue(null);
    db.user.create.mockResolvedValue({
      id: "u1",
      email: "ann@b.lk",
      name: "Ann Provider",
      role: "PROVIDER",
      sessionVersion: 0,
    });
    // Response lost after the row committed: identity sees a timeout, never the id.
    vi.mocked(createProviderProfile).mockRejectedValue(new Error("timeout"));

    const res = await post("/api/auth/register", registerBody);
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "Upstream service unavailable" });
    // Both cleanups run: erase any orphaned Provider row, then delete the user.
    expect(eraseProviderProfile).toHaveBeenCalledWith("u1");
    expect(db.user.delete).toHaveBeenCalledWith({ where: { id: "u1" } });
  });

  it("still returns a consistent 502 when the compensating provider-erase itself fails", async () => {
    db.user.findUnique.mockResolvedValue(null);
    db.user.create.mockResolvedValue({
      id: "u1",
      email: "ann@b.lk",
      name: "Ann Provider",
      role: "PROVIDER",
      sessionVersion: 0,
    });
    vi.mocked(createProviderProfile).mockRejectedValue(new Error("peer down"));
    // A failed orphan-erase is best-effort: logged, never escalated to a 500,
    // and the user cleanup still proceeds.
    vi.mocked(eraseProviderProfile).mockRejectedValue(new Error("erase down"));

    const res = await post("/api/auth/register", registerBody);
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "Upstream service unavailable" });
    expect(db.user.delete).toHaveBeenCalledWith({ where: { id: "u1" } });
  });

  it("still returns a consistent 502 when the compensating delete itself fails", async () => {
    db.user.findUnique.mockResolvedValue(null);
    db.user.create.mockResolvedValue({
      id: "u1",
      email: "ann@b.lk",
      name: "Ann Provider",
      role: "PROVIDER",
      sessionVersion: 0,
    });
    vi.mocked(createProviderProfile).mockRejectedValue(new Error("peer down"));
    // A DB hiccup on cleanup must not turn the graceful 502 into a 500.
    db.user.delete.mockRejectedValue(new Error("db down"));

    const res = await post("/api/auth/register", registerBody);
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "Upstream service unavailable" });
    expect(db.user.delete).toHaveBeenCalledWith({ where: { id: "u1" } });
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
    // The reused profile's contactPhone is refreshed with the wizard's phone
    // (#553) — the create path writes it itself, so only this path syncs.
    expect(syncContactToProvider).toHaveBeenCalledWith("u1", {
      phone: "+94771234567",
    });
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

  // #550: the exploit chain — admin suspends, provider leave-providers (role →
  // CUSTOMER), then complete-providers. The reactivate refusal must surface as
  // a 403 with NO role flip, so the ADMIN suspension stays in force.
  it("403s the re-upgrade when the profile is ADMIN-suspended (role not flipped)", async () => {
    db.user.findUnique.mockResolvedValue({
      id: "u1",
      email: "a@b.lk",
      name: "Ann",
      role: "CUSTOMER",
    });
    vi.mocked(getProviderIdByUser).mockResolvedValue("prov-1");
    vi.mocked(reactivateProviderProfile).mockRejectedValue(
      new ProviderAdminSuspendedError()
    );

    const res = await post("/api/auth/complete-provider", providerBody, AUTH_HEADERS);
    expect(res.status).toBe(403);
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

  // #360: a provider's JobResponses (their written message — PII) are keyed by
  // provider id, and the job erase only deletes them when it receives that id.
  // The resolved providerId must therefore reach eraseUserData so the responses
  // are covered.
  it("passes the resolved providerId to the erase so job responses are covered", async () => {
    db.user.findUnique.mockResolvedValue({
      id: "u1",
      email: "a@b.lk",
      role: "PROVIDER",
      passwordHash: currentHash,
    });
    vi.mocked(resolveProviderIdForErase).mockResolvedValue("prov-1");
    const res = await post(
      "/api/auth/delete-account",
      { password: CURRENT_PASSWORD },
      AUTH_HEADERS
    );
    expect(res.status).toBe(200);
    expect(eraseUserData).toHaveBeenCalledWith("u1", "prov-1");
    expect(db.user.delete).toHaveBeenCalledWith({ where: { id: "u1" } });
  });

  // #360: if resolving the providerId transiently fails, we must abort with 502
  // rather than proceed with a null id — that would erase the User while leaving
  // the provider's job responses (PII) behind. All-or-nothing, never partial.
  it("502s and deletes nothing when the providerId lookup fails (no partial erase)", async () => {
    db.user.findUnique.mockResolvedValue({
      id: "u1",
      email: "a@b.lk",
      role: "PROVIDER",
      passwordHash: currentHash,
    });
    vi.mocked(resolveProviderIdForErase).mockRejectedValue(
      new Error("provider-service down")
    );
    const res = await post(
      "/api/auth/delete-account",
      { password: CURRENT_PASSWORD },
      AUTH_HEADERS
    );
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "Upstream service unavailable" });
    // The erase never ran and no local rows were touched, so a retry finishes it.
    expect(eraseUserData).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(db.user.delete).not.toHaveBeenCalled();
  });
});
