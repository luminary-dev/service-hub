// Transactional auth/security emails ONLY — these are not notifications and
// take no preferences, so they keep dedicated routes permanently. Marketplace
// events (inquiry, thread reply, reviews, job match/response, saved-search
// match, ...) flow through POST /internal/notifications/events instead
// (routes/events.ts); the four legacy per-event email routes were deleted
// when their callers migrated (RFC stateful-notification-service, phase 3).
import { Hono, type Context } from "hono";
import { z } from "zod";
import {
  accountExistsEmail,
  changeEmail,
  emailChangeAttemptEmail,
  passwordResetEmail,
  sendMail,
  verifyEmail,
  type Locale,
} from "../lib/email";

export const emailRoutes = new Hono();

// Locale defaults to "en"; anything that isn't a known locale coerces to "en".
function coerceLocale(value: unknown): Locale {
  return value === "si" ? "si" : "en";
}

const baseSchema = z.object({
  to: z.string().email(),
  url: z.string().min(1),
  locale: z.unknown().optional(),
});

async function readBody(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return null;
  }
}

emailRoutes.post("/verify", async (c) => {
  const parsed = baseSchema.safeParse(await readBody(c));
  if (!parsed.success) return c.json({ error: "Invalid input" }, 400);
  const { to, url, locale } = parsed.data;
  const { subject, html } = verifyEmail(url, coerceLocale(locale));
  const { delivered } = await sendMail({ to, subject, html });
  return c.json({ ok: true, delivered });
});

emailRoutes.post("/password-reset", async (c) => {
  const parsed = baseSchema.safeParse(await readBody(c));
  if (!parsed.success) return c.json({ error: "Invalid input" }, 400);
  const { to, url, locale } = parsed.data;
  const { subject, html } = passwordResetEmail(url, coerceLocale(locale));
  const { delivered } = await sendMail({ to, subject, html });
  return c.json({ ok: true, delivered });
});

emailRoutes.post("/change-email", async (c) => {
  const parsed = baseSchema.safeParse(await readBody(c));
  if (!parsed.success) return c.json({ error: "Invalid input" }, 400);
  const { to, url, locale } = parsed.data;
  const { subject, html } = changeEmail(url, coerceLocale(locale));
  const { delivered } = await sendMail({ to, subject, html });
  return c.json({ ok: true, delivered });
});

emailRoutes.post("/account-exists", async (c) => {
  const parsed = baseSchema.safeParse(await readBody(c));
  if (!parsed.success) return c.json({ error: "Invalid input" }, 400);
  const { to, url, locale } = parsed.data;
  const { subject, html } = accountExistsEmail(url, coerceLocale(locale));
  const { delivered } = await sendMail({ to, subject, html });
  return c.json({ ok: true, delivered });
});

emailRoutes.post("/email-change-attempt", async (c) => {
  const parsed = baseSchema.safeParse(await readBody(c));
  if (!parsed.success) return c.json({ error: "Invalid input" }, 400);
  const { to, url, locale } = parsed.data;
  const { subject, html } = emailChangeAttemptEmail(url, coerceLocale(locale));
  const { delivered } = await sendMail({ to, subject, html });
  return c.json({ ok: true, delivered });
});

