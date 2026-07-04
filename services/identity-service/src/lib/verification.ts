// Port of the monolith's src/lib/verification.ts. Email delivery now goes
// S2S to notification-service instead of calling Resend directly.
import { db } from "../db";
import { s2s } from "./http";
import { log } from "./log";
import { createToken, VERIFY_TOKEN_TTL_MS, RESET_TOKEN_TTL_MS } from "./tokens";

const NOTIFICATION_SERVICE_URL =
  process.env.NOTIFICATION_SERVICE_URL ?? "http://localhost:4005";

export type Locale = "en" | "si";

async function sendEmail(
  path: "/internal/email/verify" | "/internal/email/password-reset",
  body: { to: string; url: string; locale: Locale }
) {
  const res = await s2s(NOTIFICATION_SERVICE_URL, path, {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`notification-service responded ${res.status}`);
  }
}

// Creates a fresh verification token and emails the link. Best-effort: callers
// (e.g. registration) should not fail if email delivery throws.
export async function sendVerificationEmail(
  userId: string,
  email: string,
  origin: string,
  locale: Locale = "en"
) {
  await db.emailVerificationToken.deleteMany({ where: { userId } });
  const { raw, hash } = createToken();
  await db.emailVerificationToken.create({
    data: {
      tokenHash: hash,
      userId,
      expiresAt: new Date(Date.now() + VERIFY_TOKEN_TTL_MS),
    },
  });
  const url = `${origin}/verify-email?token=${raw}`;
  await sendEmail("/internal/email/verify", { to: email, url, locale });
}

// Rotates the user's password-reset token (single active token, 1h TTL) and
// emails the link. Email failure is logged, not surfaced — forgot-password is
// anti-enumeration and always answers { ok: true }.
export async function sendPasswordResetEmail(
  userId: string,
  email: string,
  origin: string,
  locale: Locale = "en"
) {
  await db.passwordResetToken.deleteMany({ where: { userId } });
  const { raw, hash } = createToken();
  await db.passwordResetToken.create({
    data: {
      tokenHash: hash,
      userId,
      expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
    },
  });
  const url = `${origin}/reset-password?token=${raw}`;
  try {
    await sendEmail("/internal/email/password-reset", { to: email, url, locale });
  } catch (e) {
    log.error("email send failed", { context: "forgot-password", err: e });
  }
}
