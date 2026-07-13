import { Hono } from "hono";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "../db";
import { getAuth, getLocale, getOrigin } from "../lib/http";
import { log } from "../lib/log";
import { createSession, destroySession } from "../lib/session";
import { hashToken } from "../lib/tokens";
import { eraseUserData } from "../lib/erase";
import { isLockedOut, lockUntilFor } from "../lib/lockout";
import { passwordSchema, providerSchema, registerSchema } from "../lib/register-schema";
import { emailAddress } from "../lib/field-rules";
import { categoryValidator } from "../lib/categories";
import {
  createProviderProfile,
  deactivateProviderProfile,
  eraseProviderProfile,
  getProviderIdByUser,
  reactivateProviderProfile,
  resolveProviderIdForErase,
  syncContactToProvider,
} from "../lib/providers";
import { logAudit } from "../lib/audit";
import { publishRevocation } from "../lib/revocation";
import { removeStoredFile } from "../lib/storage";
import {
  sendAccountExistsEmail,
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

  // Anti-enumeration (#373): registration must not reveal whether an email is
  // already registered. A 409 "already exists" here (like the old behavior) let
  // an attacker probe which addresses have accounts — the exact leak login and
  // forgot-password already close. So a taken email is NOT rejected: we mail the
  // real owner an "account already exists" notice out-of-band and return the
  // same generic success shape the caller can't distinguish from a brand-new
  // signup. The dummy hash below equalizes the bcrypt cost the create path pays,
  // so the taken-email branch isn't an obvious faster/earlier return (mirrors
  // login's DUMMY_HASH compare); the mail is fire-and-forget so it adds no
  // measurable round-trip either. No duplicate user is created.
  const existing = await db.user.findUnique({ where: { email: data.email } });
  if (existing) {
    await bcrypt.hash(data.password, 10);
    void sendAccountExistsEmail(data.email, getOrigin(c), getLocale(c)).catch(
      (e) =>
        log.error("account-exists email failed", { context: "register", err: e })
    );
    return c.json({ ok: true });
  }

  const passwordHash = await bcrypt.hash(data.password, 10);

  // The findUnique above is a fast path, not a guarantee: two concurrent
  // registrations with the same email both pass it, and the loser hits the
  // unique constraint. Catch P2002 and give it the same anti-enumeration
  // response as the fast-path branch above rather than a 500 (or a 409 tell).
  const user = await db.user
    .create({
      data: {
        email: data.email,
        passwordHash,
        name: data.name,
        phone: data.phone,
        role: data.role,
      },
    })
    .catch((e: unknown) => {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002"
      ) {
        return null;
      }
      throw e;
    });
  if (!user) {
    void sendAccountExistsEmail(data.email, getOrigin(c), getLocale(c)).catch(
      (e) =>
        log.error("account-exists email failed", { context: "register", err: e })
    );
    return c.json({ ok: true });
  }

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
      // Compensation: the user row is useless without its provider profile, so
      // roll it back. Two independent best-effort cleanups, because the failure
      // above is ambiguous — provider-service may have committed the Provider
      // row and merely lost its *response* (a timeout), in which case deleting
      // the user alone would leave an orphaned Provider with a dangling userId
      // (#359).
      //
      // Erase the (possibly-committed) provider FIRST, then delete the user:
      // the orphan we're guarding against lives in provider-service, so clean
      // it while we still hold the context, before dropping the local row. The
      // erase is idempotent — a no-op when nothing was committed — and both
      // steps are best-effort: a failure is logged for later cleanup but must
      // not let the throw turn a graceful "upstream down" into a 500.
      await eraseProviderProfile(user.id).catch((eraseErr) => {
        log.error("orphan provider cleanup failed", {
          context: "register",
          userId: user.id,
          err: eraseErr,
        });
      });
      await db.user.delete({ where: { id: user.id } }).catch((delErr) => {
        log.error("orphan user cleanup failed", {
          context: "register",
          userId: user.id,
          err: delErr,
        });
      });
      return c.json({ error: "Upstream service unavailable" }, 502);
    }
  }

  await createSession(c, {
    userId: user.id,
    role: user.role,
    name: user.name,
    sv: user.sessionVersion,
    avatar: user.avatarUrl,
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
// POST /api/auth/complete-provider — turn the signed-in user (typically a fresh
// social signup that chose "I offer services") into a PROVIDER by creating the
// provider profile and flipping the role. Reuses the provider registration
// fields minus the account fields (name/email come from the existing user).
// ---------------------------------------------------------------------------
const completeProviderSchema = providerSchema.omit({
  role: true,
  email: true,
  password: true,
  name: true,
});

authRoutes.post("/complete-provider", async (c) => {
  const auth = getAuth(c);
  if (!auth) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = completeProviderSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      400
    );
  }
  const data = parsed.data;

  if (!(await categoryValidator.isValidCategory(data.category))) {
    return c.json({ error: "Invalid category" }, 400);
  }

  const user = await db.user.findUnique({ where: { id: auth.userId } });
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  if (user.role === "PROVIDER") {
    return c.json({ error: "This account is already a provider." }, 409);
  }
  // ADMIN/SUPPORT staff shouldn't self-convert into a provider listing.
  if (user.role !== "CUSTOMER") {
    return c.json({ error: "This account cannot become a provider." }, 403);
  }

  // Idempotency guard against a double-submit creating two profiles: if a
  // profile already exists for this user (best-effort lookup), reuse it.
  let providerId = await getProviderIdByUser(user.id);
  if (!providerId) {
    try {
      providerId = await createProviderProfile({
        userId: user.id,
        name: user.name,
        email: user.email,
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
      log.error("provider creation failed", { context: "complete-provider", err: e });
      return c.json({ error: "Upstream service unavailable" }, 502);
    }
  } else {
    // Re-upgrade (#403): the profile already exists but may have been
    // self-deactivated on a prior downgrade. Reactivate it so it returns to
    // public listings; fail loudly (502) rather than flip the role while the
    // profile stays hidden.
    try {
      await reactivateProviderProfile(user.id);
    } catch (e) {
      log.error("provider reactivation failed", { context: "complete-provider", err: e });
      return c.json({ error: "Upstream service unavailable" }, 502);
    }
    // The reused profile kept the contactPhone from its first registration;
    // mirror the wizard's fresh phone onto it (#553). Best-effort — the
    // create path above already writes it, so only this reuse path syncs.
    await syncContactToProvider(user.id, { phone: data.phone });
  }

  // Flip the role and bump sessionVersion so the old CUSTOMER token is revoked
  // and the fresh cookie below carries PROVIDER.
  const updated = await db.user.update({
    where: { id: user.id },
    data: { role: "PROVIDER", phone: data.phone, sessionVersion: { increment: 1 } },
  });

  await createSession(c, {
    userId: updated.id,
    role: updated.role,
    name: updated.name,
    sv: updated.sessionVersion,
    avatar: updated.avatarUrl,
  });

  return c.json({
    user: { id: updated.id, name: updated.name, role: updated.role },
    providerId,
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/leave-provider
// ---------------------------------------------------------------------------
// Counterpart to complete-provider (#403): a provider reverting to a plain
// customer. Owns the request/cookie so it can re-issue the session as CUSTOMER
// with no re-login (an S2S call can't touch the caller's cookie). Suspend/hide,
// not delete — reviews/inquiries/job responses are retained and re-upgrading
// restores the profile.
authRoutes.post("/leave-provider", async (c) => {
  const auth = getAuth(c);
  if (!auth) return c.json({ error: "Unauthorized" }, 401);

  const user = await db.user.findUnique({ where: { id: auth.userId } });
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  if (user.role !== "PROVIDER") {
    return c.json({ error: "You are not a provider." }, 409);
  }

  // Hide the profile FIRST (write-path gate). If provider-service is down we
  // return 502 and leave the role untouched, so the two services never disagree
  // ("still a provider in listings but a customer in identity").
  try {
    await deactivateProviderProfile(user.id);
  } catch (e) {
    log.error("provider deactivate failed", { context: "leave-provider", err: e });
    return c.json({ error: "Upstream service unavailable" }, 502);
  }

  // Flip role → CUSTOMER and bump sessionVersion (old PROVIDER token revoked);
  // the fresh cookie below keeps this session signed in as a customer.
  const updated = await db.user.update({
    where: { id: user.id },
    data: { role: "CUSTOMER", sessionVersion: { increment: 1 } },
  });

  await createSession(c, {
    userId: updated.id,
    role: updated.role,
    name: updated.name,
    sv: updated.sessionVersion,
    avatar: updated.avatarUrl,
  });

  await logAudit(c, "LEAVE_PROVIDER", "USER", updated.id);

  return c.json({ user: { id: updated.id, name: updated.name, role: updated.role } });
});

// ---------------------------------------------------------------------------
// POST /api/auth/login
// ---------------------------------------------------------------------------
const loginSchema = z.object({
  email: emailAddress,
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

  // Social-only account (#398): no password set. Same uniform 401 as a wrong
  // password, with a dummy compare so the timing doesn't reveal the difference.
  if (!user.passwordHash) {
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
    // Increment atomically in the DB rather than overwriting from the pre-read
    // snapshot: concurrent wrong-password attempts must each advance the
    // counter, otherwise a parallel guesser reaches MAX_FAILED_LOGINS far more
    // slowly than intended and the brute-force lockout is weakened. Derive the
    // lock from the *resulting* count, then set lockedUntil only when the
    // threshold is crossed (a second, conditional write).
    const { failedLogins } = await db.user.update({
      where: { id: user.id },
      data: { failedLogins: { increment: 1 } },
      select: { failedLogins: true },
    });
    const lockedUntil = lockUntilFor(failedLogins);
    if (lockedUntil) {
      await db.user.update({ where: { id: user.id }, data: { lockedUntil } });
    }
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
    avatar: user.avatarUrl,
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

  // Mirror the bump into the shared revocation list (#374) so the gateway
  // rejects the now-stale tokens even if identity is unreachable.
  await publishRevocation(user.id, user.sessionVersion);

  await createSession(c, {
    userId: user.id,
    role: user.role,
    name: user.name,
    sv: user.sessionVersion,
    avatar: user.avatarUrl,
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
// password is optional: social-only accounts (#398) have none, so the valid
// session is the re-auth. Password accounts must still confirm (checked below).
const deleteAccountSchema = z.object({ password: z.string().min(1).optional() });

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
  if (user.passwordHash) {
    if (
      !parsed.data.password ||
      !(await bcrypt.compare(parsed.data.password, user.passwordHash))
    ) {
      return c.json({ error: "Incorrect password." }, 400);
    }
  }

  // providerId must be resolved BEFORE the provider profile is erased —
  // job-service needs it to delete the provider's JobResponses (PII). Resolve
  // it with the fail-loud helper (NOT getProviderIdByUser, which degrades to
  // null): a transient blip here must abort with 502, not silently pass null to
  // the job erase and leave the responses behind while the User is deleted (#360).
  try {
    const providerId = await resolveProviderIdForErase(user.id);
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

  // The avatar file (PII, #434) lives in media-service and would otherwise
  // outlive the account (#555). After the local delete so a failed transaction
  // can't erase a still-referenced file; best-effort — removeStoredFile
  // swallows errors and the `user`-namespace orphan sweep catches any miss.
  if (user.avatarUrl) {
    await removeStoredFile(user.avatarUrl);
  }

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
      phone: user.phone,
      emailVerified: user.emailVerified,
      role: user.role,
      avatarUrl: user.avatarUrl,
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
      { error: "New password must be between 10 and 100 characters." },
      400
    );
  }

  const user = await db.user.findUnique({ where: { id: auth.userId } });
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  // Social-only account (#398): no current password to confirm against. Direct
  // them to the reset flow, which can set a first password from an email token.
  if (!user.passwordHash) {
    return c.json(
      { error: "No password is set for this account. Use ‘forgot password’ to create one." },
      400
    );
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

  // Mirror the bump into the shared revocation list (#374) so the gateway
  // rejects the old (hijacked) tokens even if identity is unreachable.
  await publishRevocation(updated.id, updated.sessionVersion);

  await createSession(c, {
    userId: updated.id,
    role: updated.role,
    name: updated.name,
    sv: updated.sessionVersion,
    avatar: updated.avatarUrl,
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
const forgotSchema = z.object({ email: emailAddress });

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
    return c.json({ error: "Password must be at least 10 characters." }, 400);
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
  const [updated] = await db.$transaction([
    // sessionVersion bump: whoever prompted the reset (possibly an attacker
    // holding a session) is signed out everywhere.
    db.user.update({
      where: { id: record.userId },
      data: { passwordHash, sessionVersion: { increment: 1 } },
    }),
    // Single-use: consume every reset token for this user.
    db.passwordResetToken.deleteMany({ where: { userId: record.userId } }),
  ]);

  // Mirror the bump into the shared revocation list (#374) so the gateway
  // rejects the old tokens even if identity is unreachable.
  await publishRevocation(updated.id, updated.sessionVersion);

  return c.json({ ok: true });
});
