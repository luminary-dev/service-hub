// Account self-service endpoints (#396): profile (name/phone) edit for any
// authenticated user, and a change-email flow with re-verification. Mounted at
// /api/account. Kept separate from auth.ts (login/register/reset lifecycle) so
// the "manage my own account" surface is easy to find.
import { Hono } from "hono";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "../db";
import { getAuth, getLocale, getOrigin } from "../lib/http";
import { log } from "../lib/log";
import { createSession } from "../lib/session";
import { hashToken } from "../lib/tokens";
import { emailAddress, slPhone } from "../lib/field-rules";
import {
  sendEmailChangeAttemptNotice,
  sendEmailChangeConfirmation,
} from "../lib/verification";
import {
  ALLOWED_IMAGE_TYPES,
  InvalidImageError,
  MAX_UPLOAD_SIZE,
  removeStoredFile,
  storeImage,
} from "../lib/storage";
import {
  syncAvatarToProvider,
  syncContactToProvider,
} from "../lib/providers";

export const accountRoutes = new Hono();

// ---------------------------------------------------------------------------
// Avatar (#434): profile photo for ANY authenticated user (customer/provider/
// admin). User.avatarUrl is the source of truth; when the user also has a
// provider profile we push a denormalized copy to provider-service so the
// public cards/profile (served from there) stay in sync — best-effort, since a
// stale copy is cosmetic and must not fail the user's own update.
// ---------------------------------------------------------------------------
accountRoutes.post("/avatar", async (c) => {
  const auth = getAuth(c);
  if (!auth) return c.json({ error: "Unauthorized" }, 401);

  const form = await c.req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return c.json({ error: "No file provided" }, 400);
  }
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    return c.json({ error: "Only JPEG, PNG and WebP images are allowed" }, 400);
  }
  if (file.size > MAX_UPLOAD_SIZE) {
    return c.json({ error: "Image must be under 5MB" }, 400);
  }

  // Capture the current avatar before we overwrite it so the old object can be
  // reclaimed after the swap — otherwise every replace leaks the prior file.
  const prior = await db.user.findUnique({
    where: { id: auth.userId },
    select: { avatarUrl: true },
  });

  let avatarUrl: string;
  try {
    avatarUrl = await storeImage("user", file, "avatars");
  } catch (e) {
    if (e instanceof InvalidImageError) return c.json({ error: e.message }, 400);
    throw e;
  }

  const updated = await db.user.update({
    where: { id: auth.userId },
    data: { avatarUrl },
  });
  // The new URL is committed — reclaim the previous file. Best-effort: a failed
  // cleanup must never fail the user's update (removeStoredFile swallows too).
  // Guard against removing the just-set object if the store returned the same
  // URL.
  if (prior?.avatarUrl && prior.avatarUrl !== avatarUrl) {
    await removeStoredFile(prior.avatarUrl);
  }
  await syncAvatarToProvider(auth.userId, avatarUrl);
  // Re-issue the session so the top-nav avatar (carried in the JWT) updates
  // without a re-login.
  await createSession(c, {
    userId: updated.id,
    role: updated.role,
    name: updated.name,
    sv: updated.sessionVersion,
    avatar: updated.avatarUrl,
  });
  return c.json({ avatarUrl });
});

accountRoutes.delete("/avatar", async (c) => {
  const auth = getAuth(c);
  if (!auth) return c.json({ error: "Unauthorized" }, 401);
  // Grab the current avatar so we can delete the stored object after clearing
  // the row — clearing it alone would orphan the file.
  const prior = await db.user.findUnique({
    where: { id: auth.userId },
    select: { avatarUrl: true },
  });
  const updated = await db.user.update({
    where: { id: auth.userId },
    data: { avatarUrl: null },
  });
  // Best-effort reclaim of the removed file (never fails the request).
  if (prior?.avatarUrl) {
    await removeStoredFile(prior.avatarUrl);
  }
  await syncAvatarToProvider(auth.userId, null);
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
// PUT /api/account/profile — edit own name + phone
// ---------------------------------------------------------------------------
const profileSchema = z.object({
  name: z.string().trim().min(2).max(80),
  phone: slPhone,
});

accountRoutes.put("/profile", async (c) => {
  const auth = getAuth(c);
  if (!auth) return c.json({ error: "Unauthorized" }, 401);

  const parsed = profileSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      400
    );
  }

  const updated = await db.user.update({
    where: { id: auth.userId },
    data: { name: parsed.data.name, phone: parsed.data.phone },
  });

  // Mirror the new name/phone onto the denormalized Provider contact columns
  // (#553) — best-effort, no-op for users without a provider profile.
  await syncContactToProvider(auth.userId, {
    name: updated.name,
    phone: updated.phone,
  });

  // The session JWT carries the display name (used in the header/UserMenu);
  // reissue it so the cached name matches immediately without a re-login.
  await createSession(c, {
    userId: updated.id,
    role: updated.role,
    name: updated.name,
    sv: updated.sessionVersion,
    avatar: updated.avatarUrl,
  });

  return c.json({ ok: true, user: { name: updated.name, phone: updated.phone } });
});

// ---------------------------------------------------------------------------
// POST /api/account/email/change — request a change; emails the NEW address
// ---------------------------------------------------------------------------
// Normalize (trim + lowercase) with the shared rule that register/login/forgot
// use, so a mixed-case new address is compared against the lowercase address we
// actually store: the taken-check can't miss a case-variant of an existing
// account, and the value we later persist is one that password login (which
// lowercases its input) can still match (security-audit M8).
//
// password is optional: social-only accounts (#398) have none, so a valid
// session is their re-auth. Password accounts must confirm it (checked below,
// #504).
const emailSchema = z.object({
  email: emailAddress,
  password: z.string().min(1).optional(),
});

accountRoutes.post("/email/change", async (c) => {
  const auth = getAuth(c);
  if (!auth) return c.json({ error: "Unauthorized" }, 401);

  const parsed = emailSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    // Stable machine-readable codes (#761) so the /si UI can localize the
    // message instead of rendering the English string verbatim.
    return c.json(
      { error: "Enter a valid email address.", code: "invalid_input" },
      400
    );
  }
  const newEmail = parsed.data.email;

  const user = await db.user.findUnique({ where: { id: auth.userId } });
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  if (newEmail.toLowerCase() === user.email.toLowerCase()) {
    return c.json(
      { error: "That is already your email address.", code: "same_email" },
      400
    );
  }

  // #504: changing the login email is a sensitive op, so re-authenticate the
  // current password before issuing the confirmation link — the same guard
  // delete-account and change-password use. Social-only accounts (#398) have no
  // passwordHash; for them the valid session IS the re-auth, so they keep the
  // session-only path. This check depends only on the caller's own hash, so it
  // costs the same whether or not the target address is free and never becomes
  // an enumeration signal itself.
  if (user.passwordHash) {
    if (
      !parsed.data.password ||
      !(await bcrypt.compare(parsed.data.password, user.passwordHash))
    ) {
      return c.json(
        { error: "Incorrect password.", code: "incorrect_password" },
        400
      );
    }
  }

  // #503: anti-enumeration. Whether or not the target address already belongs to
  // another account, answer with the SAME generic success — a distinguishable
  // 409 "already exists" here let a signed-in attacker probe which addresses
  // have accounts (the leak register/login/forgot-password already close). When
  // the address IS taken we do NOT start a change; instead we mail the real
  // owner an out-of-band "someone tried to move an account to your email" notice.
  // Both branches fire their mail and-forget it (never awaited, like
  // forgot-password / register #498) and return the identical shape, so the
  // taken branch is neither observably different nor measurably faster.
  const taken = await db.user.findUnique({ where: { email: newEmail } });
  if (taken) {
    void sendEmailChangeAttemptNotice(newEmail, getOrigin(c), getLocale(c)).catch(
      (e) =>
        log.error("email-change-attempt notice failed", { context: "account", err: e })
    );
    return c.json({ ok: true });
  }

  void sendEmailChangeConfirmation(
    user.id,
    newEmail,
    getOrigin(c),
    getLocale(c)
  ).catch((e) =>
    log.error("change-email send failed", { context: "account", err: e })
  );

  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// POST /api/account/email/confirm — consume the token, switch the address
// ---------------------------------------------------------------------------
// No session required: the token was sent to the new address, so possessing it
// is the proof of control (mirrors verify-email / reset-password). We do NOT
// bump sessionVersion — email is not part of the session JWT, so the switch
// doesn't invalidate existing sessions and the user stays signed in.
const confirmSchema = z.object({ token: z.string().min(1) });

accountRoutes.post("/email/confirm", async (c) => {
  const parsed = confirmSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid" }, 400);

  const record = await db.emailChangeToken.findUnique({
    where: { tokenHash: hashToken(parsed.data.token) },
  });
  if (!record || record.expiresAt < new Date()) {
    // deleteMany, not delete: a double-submit races to delete the same row and
    // delete() throws P2025 on the loser (a spurious 500). deleteMany no-ops.
    if (record) {
      await db.emailChangeToken.deleteMany({ where: { id: record.id } });
    }
    return c.json({ error: "expired" }, 400);
  }

  // The stored token address was already normalized at request time; lowercase
  // it again on write as a belt-and-braces guard so the persisted email is
  // always the lowercase form password login compares against (M8).
  const newEmail = record.newEmail.trim().toLowerCase();

  try {
    await db.$transaction([
      db.user.update({
        where: { id: record.userId },
        data: { email: newEmail, emailVerified: new Date() },
      }),
      // Single-use: consume every pending change token for this user.
      db.emailChangeToken.deleteMany({ where: { userId: record.userId } }),
    ]);
  } catch (e) {
    // The address was claimed by someone else between request and confirm.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      await db.emailChangeToken.deleteMany({ where: { userId: record.userId } });
      return c.json({ error: "taken" }, 409);
    }
    throw e;
  }

  // Mirror the new address onto the denormalized Provider contact email (#553)
  // so inquiry/lead notifications follow the account — best-effort, no-op for
  // users without a provider profile.
  await syncContactToProvider(record.userId, { email: newEmail });

  return c.json({ ok: true });
});
