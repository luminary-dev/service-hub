import { Hono, type Context } from "hono";
import { z } from "zod";
import {
  inquiryEmail,
  jobResponseEmail,
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
  to: z.string().min(1),
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

emailRoutes.post("/inquiry", async (c) => {
  const parsed = inquirySchema.safeParse(await readBody(c));
  if (!parsed.success) return c.json({ error: "Invalid input" }, 400);
  const { to, url, customerName, locale } = parsed.data;
  const { subject, html } = inquiryEmail(url, customerName, coerceLocale(locale));
  const { delivered } = await sendMail({ to, subject, html });
  return c.json({ ok: true, delivered });
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
