import { db } from "./db";
import { createToken, VERIFY_TOKEN_TTL_MS } from "./tokens";
import { sendMail, verifyEmail } from "./email";
import type { Locale } from "./i18n";

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
  const { subject, html } = verifyEmail(url, locale);
  await sendMail({ to: email, subject, html });
}
