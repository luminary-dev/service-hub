import { Hono, type Context } from "hono";
import { z } from "zod";
import {
  accountExistsEmail,
  changeEmail,
  inquiryEmail,
  jobResponseEmail,
  newJobEmail,
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

const jobResponseSchema = baseSchema.extend({
  providerName: z.string().min(1),
  jobTitle: z.string().min(1),
});

const inquirySchema = baseSchema.extend({
  customerName: z.string().min(1),
});

// New-matching-job alert (#501). Unlike the single-recipient templates this is
// a fan-out: job-service resolves the matching providers once and hands the
// whole (already capped + deduped) recipient list here, so one S2S call emails
// them all. Cap mirrors provider-service's MAX_MATCHING_PROVIDERS.
const newJobSchema = z.object({
  recipients: z.array(z.string().email()).min(1).max(200),
  url: z.string().min(1),
  jobTitle: z.string().min(1),
  district: z.string().min(1),
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

emailRoutes.post("/inquiry", async (c) => {
  const parsed = inquirySchema.safeParse(await readBody(c));
  if (!parsed.success) return c.json({ error: "Invalid input" }, 400);
  const { to, url, customerName, locale } = parsed.data;
  const { subject, html } = inquiryEmail(url, customerName, coerceLocale(locale));
  const { delivered } = await sendMail({ to, subject, html });
  return c.json({ ok: true, delivered });
});

emailRoutes.post("/new-job", async (c) => {
  const parsed = newJobSchema.safeParse(await readBody(c));
  if (!parsed.success) return c.json({ error: "Invalid input" }, 400);
  const { recipients, url, jobTitle, district, locale } = parsed.data;
  const { subject, html } = newJobEmail(url, jobTitle, district, coerceLocale(locale));
  // Dedupe defensively (job-service already dedupes, but the recipient list is
  // untrusted here) and send one copy per provider. Best-effort fan-out: a
  // single failed send must not sink the rest, so swallow per-recipient errors
  // and report how many were delivered.
  const unique = [...new Set(recipients.map((r) => r.toLowerCase()))];
  let delivered = 0;
  for (const to of unique) {
    try {
      const { delivered: sent } = await sendMail({ to, subject, html });
      if (sent) delivered++;
    } catch {
      // best-effort — keep going for the remaining recipients
    }
  }
  return c.json({ ok: true, sent: unique.length, delivered });
});

emailRoutes.post("/job-response", async (c) => {
  const parsed = jobResponseSchema.safeParse(await readBody(c));
  if (!parsed.success) return c.json({ error: "Invalid input" }, 400);
  const { to, url, providerName, jobTitle, locale } = parsed.data;
  const { subject, html } = jobResponseEmail(
    url,
    providerName,
    jobTitle,
    coerceLocale(locale)
  );
  const { delivered } = await sendMail({ to, subject, html });
  return c.json({ ok: true, delivered });
});
