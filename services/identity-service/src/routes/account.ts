// Account self-service endpoints (#396): profile (name/phone) edit for any
// authenticated user, and a change-email flow with re-verification. Mounted at
// /api/account. Kept separate from auth.ts (login/register/reset lifecycle) so
// the "manage my own account" surface is easy to find.
import { Hono } from "hono";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "../db";
import { getAuth, getLocale, getOrigin } from "../lib/http";
import { log } from "../lib/log";
import { createSession } from "../lib/session";
import { hashToken } from "../lib/tokens";
import { slPhone } from "../lib/field-rules";
import { sendEmailChangeConfirmation } from "../lib/verification";
import {
  ALLOWED_IMAGE_TYPES,
  InvalidImageError,
  MAX_UPLOAD_SIZE,
  storeImage,
} from "../lib/storage";
import { syncAvatarToProvider } from "../lib/providers";

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

  let avatarUrl: string;
  try {
    avatarUrl = await storeImage("user", file, "avatars");
  } catch (e) {
    if (e instanceof InvalidImageError) return c.json({ error: e.message }, 400);
    throw e;
  }

  await db.user.update({ where: { id: auth.userId }, data: { avatarUrl } });
  await syncAvatarToProvider(auth.userId, avatarUrl);
  return c.json({ avatarUrl });
});

accountRoutes.delete("/avatar", async (c) => {
  const auth = getAuth(c);
  if (!auth) return c.json({ error: "Unauthorized" }, 401);
  await db.user.update({ where: { id: auth.userId }, data: { avatarUrl: null } });
  await syncAvatarToProvider(auth.userId, null);
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

  // The session JWT carries the display name (used in the header/UserMenu);
  // reissue it so the cached name matches immediately without a re-login.
  await createSession(c, {
    userId: updated.id,
    role: updated.role,
    name: updated.name,
    sv: updated.sessionVersion,
  });

  return c.json({ ok: true, user: { name: updated.name, phone: updated.phone } });
});

// ---------------------------------------------------------------------------
// POST /api/account/email/change — request a change; emails the NEW address
// ---------------------------------------------------------------------------
const emailSchema = z.object({ email: z.string().trim().email() });

accountRoutes.post("/email/change", async (c) => {
  const auth = getAuth(c);
  if (!auth) return c.json({ error: "Unauthorized" }, 401);

  const parsed = emailSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: "Enter a valid email address." }, 400);
  }
  const newEmail = parsed.data.email;

  const user = await db.user.findUnique({ where: { id: auth.userId } });
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  if (newEmail.toLowerCase() === user.email.toLowerCase()) {
    return c.json({ error: "That is already your email address." }, 400);
  }

  // Same 409 as registration when the address is taken — no new enumeration
  // surface beyond what register already exposes.
  const taken = await db.user.findUnique({ where: { email: newEmail } });
  if (taken) {
    return c.json({ error: "An account with this email already exists." }, 409);
  }

  try {
    await sendEmailChangeConfirmation(user.id, newEmail, getOrigin(c), getLocale(c));
  } catch (e) {
    log.error("change-email send failed", { context: "account", err: e });
    return c.json({ error: "Could not send the confirmation email." }, 500);
  }

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
    if (record) {
      await db.emailChangeToken.delete({ where: { id: record.id } });
    }
    return c.json({ error: "expired" }, 400);
  }

  try {
    await db.$transaction([
      db.user.update({
        where: { id: record.userId },
        data: { email: record.newEmail, emailVerified: new Date() },
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

  return c.json({ ok: true });
});
