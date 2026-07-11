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

export const accountRoutes = new Hono();

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
