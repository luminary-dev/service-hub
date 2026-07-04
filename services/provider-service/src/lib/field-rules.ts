// Field-level validation rules shared by registration (identity-service) and
// profile/service editing (provider-service). Canonical shared module — both
// services keep identical copies (services are self-contained; no shared
// package), so keep edits in lockstep (#29).
import { z } from "zod";
import { DISTRICTS } from "./constants";

// Districts stay a static enum; categories are validated dynamically against
// provider-service's Category table (see lib/categories.ts) since #135/#60.
export const districtEnum = z.enum([...DISTRICTS] as [string, ...string[]]);

// Sri Lankan phone numbers (0771234567, 0112345678, +94/0094/94 variants,
// spaces/dashes/parens tolerated), normalized to E.164 (+94XXXXXXXXX) for
// storage so rendering and WhatsApp links stay consistent.
export function normalizeSlPhone(raw: string): string | null {
  const cleaned = raw.replace(/[\s()-]/g, "");
  const m = /^(?:\+94|0094|94|0)([1-9]\d{8})$/.exec(cleaned);
  return m ? `+94${m[1]}` : null;
}

const PHONE_MESSAGE = "Enter a valid Sri Lankan phone number";

export const slPhone = z
  .string()
  .trim()
  .max(20)
  .transform((value, ctx) => {
    const normalized = normalizeSlPhone(value);
    if (!normalized) {
      ctx.addIssue({ code: "custom", message: PHONE_MESSAGE });
      return z.NEVER;
    }
    return normalized;
  });

// Optional phone fields (whatsapp, phone2): missing/empty pass through so
// route code can keep its `value || null` persistence idiom. `.optional()`
// must wrap the pipe — in zod 4 a transform is otherwise nonoptional even
// when its input accepts undefined.
export const optionalSlPhone = z
  .string()
  .transform((value, ctx) => {
    const trimmed = value.trim();
    if (trimmed === "") return "";
    const normalized = normalizeSlPhone(trimmed);
    if (!normalized) {
      ctx.addIssue({ code: "custom", message: PHONE_MESSAGE });
      return z.NEVER;
    }
    return normalized;
  })
  .optional();

// Social/website links: scheme-optional input ("facebook.com/nuwan" works),
// stored as a normalized http(s) URL. Rejects embedded credentials, dotless
// hosts and non-web schemes so a stored value can never render as a working
// javascript:/data: link.
export function normalizeWebUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > 200) return null;
  const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.username !== "" || url.password !== "") return null;
  if (!url.hostname.includes(".")) return null;
  // Cap the FINAL href too: adding https:// to a near-200-char input must not
  // overflow the 200-char storage/S2S contracts.
  if (url.href.length > 200) return null;
  return url.href;
}

export const optionalWebUrl = z
  .string()
  .transform((value, ctx) => {
    const trimmed = value.trim();
    if (trimmed === "") return "";
    const normalized = normalizeWebUrl(trimmed);
    if (!normalized) {
      ctx.addIssue({
        code: "custom",
        message: "Enter a valid web link (https://…)",
      });
      return z.NEVER;
    }
    return normalized;
  })
  .optional();

// Whole rupees within sane marketplace bounds — integers only, so float
// artifacts can never reach totals or sorting.
export const priceRupees = z
  .number()
  .int("Price must be in whole rupees")
  .min(50, "Price must be at least Rs. 50")
  .max(10_000_000, "Price must be at most Rs. 10,000,000");
