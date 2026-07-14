// Port of the monolith's src/lib/verification.ts. Email delivery now goes
// S2S to notification-service instead of calling Resend directly.
import { db } from "../db";
import { s2s } from "./http";
import { log } from "./log";
import {
  createToken,
  VERIFY_TOKEN_TTL_MS,
  RESET_TOKEN_TTL_MS,
  EMAIL_CHANGE_TOKEN_TTL_MS,
} from "./tokens";

const NOTIFICATION_SERVICE_URL =
  process.env.NOTIFICATION_SERVICE_URL ?? "http://localhost:4005";

export type Locale = "en" | "si";

async function sendEmail(
  path:
    | "/internal/email/verify"
    | "/internal/email/password-reset"
    | "/internal/email/change-email"
    | "/internal/email/account-exists"
    | "/internal/email/email-change-attempt",
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

// Change-email (#396): rotates the user's single email-change token (1h TTL,
// pending `newEmail` stored alongside) and emails the confirmation link TO the
// new address, proving the user controls it before the switch. Delivery errors
// propagate — the caller surfaces "could not send" so the user can retry.
export async function sendEmailChangeConfirmation(
  userId: string,
  newEmail: string,
  origin: string,
  locale: Locale = "en"
) {
  await db.emailChangeToken.deleteMany({ where: { userId } });
  const { raw, hash } = createToken();
  await db.emailChangeToken.create({
    data: {
      tokenHash: hash,
      userId,
      newEmail,
      expiresAt: new Date(Date.now() + EMAIL_CHANGE_TOKEN_TTL_MS),
    },
  });
  const url = `${origin}/verify-email-change?token=${raw}`;
  await sendEmail("/internal/email/change-email", { to: newEmail, url, locale });
}

// Account-already-exists (#373): registration returns the same generic success
// whether or not the email is taken, so it cannot be used to enumerate
// accounts. When the address IS taken we send this out-of-band notice to the
// real owner instead, nudging them to sign in / reset. No token or DB write —
// the link just points at the sign-in page. Delivery errors propagate; the
// caller fires this and-forgets it (like forgot-password) so the taken-email
// branch isn't measurably slower.
export async function sendAccountExistsEmail(
  email: string,
  origin: string,
  locale: Locale = "en"
) {
  const url = `${origin}/login`;
  await sendEmail("/internal/email/account-exists", { to: email, url, locale });
}

// Change-email attempt on a taken address (#503): the change-email endpoint
// returns the same generic success whether or not the target address is already
// registered, so it cannot be used to enumerate accounts. When the address IS
// taken we do NOT start a change; instead we send this out-of-band notice to the
// real owner — someone tried to move an account onto their address. No token or
// DB write; the link points at sign-in. The caller fires this and-forgets it
// (like forgot-password) so the taken-address branch isn't measurably slower.
export async function sendEmailChangeAttemptNotice(
  email: string,
  origin: string,
  locale: Locale = "en"
) {
  const url = `${origin}/login`;
  await sendEmail("/internal/email/email-change-attempt", { to: email, url, locale });
}
