import { Hono } from "hono";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "../db";
import { getAuth, getLocale, getOrigin } from "../lib/http";
import { log } from "../lib/log";
import { createSession, destroySession } from "../lib/session";
import { hashToken } from "../lib/tokens";
import { eraseUserData } from "../lib/erase";
import { isLockedOut, recordFailure } from "../lib/lockout";
import { passwordSchema, registerSchema } from "../lib/register-schema";
import { categoryValidator } from "../lib/categories";
import {
  createProviderProfile,
  getProviderIdByUser,
} from "../lib/providers";
import {
  sendPasswordResetEmail,
  sendVerificationEmail,
} from "../lib/verification";

export const authRoutes = new Hono();

// ---------------------------------------------------------------------------
// POST /api/auth/register
// ---------------------------------------------------------------------------
authRoutes.post("/register", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      400
    );
  }
  const data = parsed.data;

  // Category is data now, not code: check it against provider-service's list
  // (60s cache, static fallback) as an explicit post-parse step.
  if (
    data.role === "PROVIDER" &&
    !(await categoryValidator.isValidCategory(data.category))
  ) {
    return c.json({ error: "Invalid category" }, 400);
  }

  const existing = await db.user.findUnique({ where: { email: data.email } });
  if (existing) {
    return c.json(
      { error: "An account with this email already exists" },
      409
    );
  }

  const passwordHash = await bcrypt.hash(data.password, 10);

  const user = await db.user.create({
    data: {
      email: data.email,
      passwordHash,
      name: data.name,
      phone: data.phone,
      role: data.role,
    },
  });

  let providerId: string | null = null;
  if (data.role === "PROVIDER") {
    try {
      providerId = await createProviderProfile({
        userId: user.id,
        name: data.name,
        email: data.email,
        phone: data.phone,
        category: data.category,
        headline: data.headline,
        bio: data.bio,
        district: data.district,
        city: data.city,
        experience: data.experience,
        whatsapp: data.whatsapp || null,
        phone2: data.phone2 || null,
        facebook: data.facebook || null,
        instagram: data.instagram || null,
        tiktok: data.tiktok || null,
        youtube: data.youtube || null,
        website: data.website || null,
        services: data.services,
      });
    } catch (e) {
      log.error("provider creation failed", { context: "register", err: e });
      // Compensation: the user row is useless without its provider profile.
      await db.user.delete({ where: { id: user.id } });
      return c.json({ error: "Upstream service unavailable" }, 502);
    }
  }

  await createSession(c, {
    userId: user.id,
    role: user.role,
    name: user.name,
    sv: user.sessionVersion,
  });

  // Best-effort: a failure here must not fail registration.
  try {
    await sendVerificationEmail(user.id, user.email, getOrigin(c), getLocale(c));
  } catch (e) {
    log.error("verification email failed", { context: "register", err: e });
  }

  return c.json({
    user: { id: user.id, name: user.name, role: user.role },
    providerId,
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/login
// ---------------------------------------------------------------------------
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// Hash compared against for unknown emails so both branches cost one bcrypt
// verification — a fast "no such user" reply would leak which emails exist.
const DUMMY_HASH = bcrypt.hashSync("timing-equalizer", 10);

authRoutes.post("/login", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid input" }, 400);
  }

  const user = await db.user.findUnique({
    where: { email: parsed.data.email },
  });
  if (!user) {
    await bcrypt.compare(parsed.data.password, DUMMY_HASH);
    return c.json({ error: "Invalid email or password" }, 401);
  }

  // Locked accounts get the same 401 as a wrong password (no enumeration),
  // and a correct guess during the window must not be observable. Run a
  // bcrypt compare anyway so the locked branch costs the same as the
  // unknown-email and wrong-password branches — otherwise the faster
  // no-hash reply leaks that the account exists and is locked.
  if (isLockedOut(user.lockedUntil)) {
    await bcrypt.compare(parsed.data.password, user.passwordHash);
    return c.json({ error: "Invalid email or password" }, 401);
  }

  if (!(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
    await db.user.update({
      where: { id: user.id },
      data: recordFailure(user.failedLogins),
    });
    return c.json({ error: "Invalid email or password" }, 401);
  }

  if (user.failedLogins > 0 || user.lockedUntil) {
    await db.user.update({
      where: { id: user.id },
      data: { failedLogins: 0, lockedUntil: null },
    });
  }

  const providerId = await getProviderIdByUser(user.id);

  await createSession(c, {
    userId: user.id,
    role: user.role,
    name: user.name,
    sv: user.sessionVersion,
  });

  return c.json({
    user: { id: user.id, name: user.name, role: user.role },
    providerId,
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/logout
// ---------------------------------------------------------------------------
authRoutes.post("/logout", (c) => {
  destroySession(c);
  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// POST /api/auth/logout-all — invalidate every session (all devices), then
// re-issue this one so the requester stays signed in.
// ---------------------------------------------------------------------------
authRoutes.post("/logout-all", async (c) => {
  const auth = getAuth(c);
  if (!auth) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const user = await db.user
    .update({
      where: { id: auth.userId },
      data: { sessionVersion: { increment: 1 } },
    })
    .catch(() => null);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  await createSession(c, {
    userId: user.id,
    role: user.role,
    name: user.name,
    sv: user.sessionVersion,
  });

  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// POST /api/auth/delete-account — self-service erasure (#68). Re-auth with
// the current password, fan out to the peers that hold the user's data, then
// delete the local row (Favorites/tokens cascade) and record a minimal audit
// row. Peer erases run FIRST: if one fails we return 502 and delete nothing
// locally, so a retry can finish the job — a still-loggable-in account beats
// an orphaned half-deleted one.
// ---------------------------------------------------------------------------
const deleteAccountSchema = z.object({ password: z.string().min(1) });

authRoutes.post("/delete-account", async (c) => {
  const auth = getAuth(c);
  if (!auth) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = deleteAccountSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid input" }, 400);
  }

  const user = await db.user.findUnique({ where: { id: auth.userId } });
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  if (!(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
    return c.json({ error: "Incorrect password." }, 400);
  }

  // providerId must be resolved BEFORE the provider profile is erased —
  // job-service needs it to delete the provider's job responses.
  const providerId = await getProviderIdByUser(user.id);
  try {
    await eraseUserData(user.id, providerId);
  } catch (e) {
    log.error("peer erase failed", { context: "delete-account", err: e });
    return c.json({ error: "Upstream service unavailable" }, 502);
  }

  await db.$transaction([
    db.accountDeletion.create({
      data: { userId: user.id, email: user.email, role: user.role },
    }),
    db.user.delete({ where: { id: user.id } }),
  ]);

  destroySession(c);
  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// GET /api/auth/me
// ---------------------------------------------------------------------------
authRoutes.get("/me", async (c) => {
  const auth = getAuth(c);
  if (!auth) return c.json({ user: null });

  const user = await db.user.findUnique({ where: { id: auth.userId } });
  if (!user) return c.json({ user: null });

  const providerId = await getProviderIdByUser(user.id);

  return c.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      providerId,
    },
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/change-password
// ---------------------------------------------------------------------------
const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
});

authRoutes.post("/change-password", async (c) => {
  const auth = getAuth(c);
  if (!auth) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = changePasswordSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: "New password must be between 6 and 100 characters." },
      400
    );
  }

  const user = await db.user.findUnique({ where: { id: auth.userId } });
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const ok = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
  if (!ok) {
    return c.json({ error: "Current password is incorrect." }, 400);
  }

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 10);
  const [updated] = await db.$transaction([
    // sessionVersion bump revokes every existing session (a hijacked one is
    // exactly why passwords get changed); the fresh cookie below keeps the
    // requester signed in.
    db.user.update({
      where: { id: user.id },
      data: { passwordHash, sessionVersion: { increment: 1 } },
    }),
    // A pending reset link would still grant access under the old email
    // flow — changing the password invalidates it, same as reset-password.
    db.passwordResetToken.deleteMany({ where: { userId: user.id } }),
  ]);

  await createSession(c, {
    userId: updated.id,
    role: updated.role,
    name: updated.name,
    sv: updated.sessionVersion,
  });

  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// POST /api/auth/verify-email
// ---------------------------------------------------------------------------
const verifyEmailSchema = z.object({ token: z.string().min(1) });

authRoutes.post("/verify-email", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = verifyEmailSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "invalid" }, 400);
  }

  const record = await db.emailVerificationToken.findUnique({
    where: { tokenHash: hashToken(parsed.data.token) },
  });
  if (!record || record.expiresAt < new Date()) {
    if (record) {
      await db.emailVerificationToken.delete({ where: { id: record.id } });
    }
    return c.json({ error: "expired" }, 400);
  }

  await db.$transaction([
    db.user.update({
      where: { id: record.userId },
      data: { emailVerified: new Date() },
    }),
    db.emailVerificationToken.deleteMany({ where: { userId: record.userId } }),
  ]);

  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// POST /api/auth/resend-verification
// ---------------------------------------------------------------------------
authRoutes.post("/resend-verification", async (c) => {
  const auth = getAuth(c);
  if (!auth) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const user = await db.user.findUnique({ where: { id: auth.userId } });
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  if (user.emailVerified) {
    return c.json({ ok: true, alreadyVerified: true });
  }

  try {
    await sendVerificationEmail(user.id, user.email, getOrigin(c), getLocale(c));
  } catch (e) {
    log.error("verification email failed", { context: "resend-verification", err: e });
    return c.json({ error: "Could not send verification email." }, 500);
  }

  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// POST /api/auth/forgot-password
// ---------------------------------------------------------------------------
const forgotSchema = z.object({ email: z.string().email() });

authRoutes.post("/forgot-password", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = forgotSchema.safeParse(body);
  // Always return the same response regardless of whether the email exists,
  // so this endpoint cannot be used to enumerate registered accounts.
  if (!parsed.success) return c.json({ ok: true });

  const user = await db.user.findUnique({
    where: { email: parsed.data.email },
  });
  if (user) {
    // Fire-and-forget: awaiting the token writes + email round-trip only for
    // registered emails makes the response measurably slower for them, which
    // re-opens the account enumeration the uniform response is meant to close.
    // Errors are logged, never surfaced (the response is identical regardless).
    void sendPasswordResetEmail(
      user.id,
      user.email,
      getOrigin(c),
      getLocale(c)
    ).catch((e) =>
      log.error("password reset send failed", { context: "auth", err: e })
    );
  }

  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// POST /api/auth/reset-password
// ---------------------------------------------------------------------------
const resetSchema = z.object({
  token: z.string().min(1),
  // Reuse the shared policy (length + breach screen) instead of a weaker inline
  // rule, so a reset can't set a password the registration flow would reject.
  password: passwordSchema,
});

authRoutes.post("/reset-password", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = resetSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Password must be at least 6 characters." }, 400);
  }

  const record = await db.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(parsed.data.token) },
  });
  if (!record || record.expiresAt < new Date()) {
    if (record) {
      await db.passwordResetToken.delete({ where: { id: record.id } });
    }
    return c.json({ error: "This reset link is invalid or has expired." }, 400);
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  await db.$transaction([
    // sessionVersion bump: whoever prompted the reset (possibly an attacker
    // holding a session) is signed out everywhere.
    db.user.update({
      where: { id: record.userId },
      data: { passwordHash, sessionVersion: { increment: 1 } },
    }),
    // Single-use: consume every reset token for this user.
    db.passwordResetToken.deleteMany({ where: { userId: record.userId } }),
  ]);

  return c.json({ ok: true });
});
