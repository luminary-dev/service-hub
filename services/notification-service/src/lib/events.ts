// Event catalog for the generic ingestion endpoint (RFC:
// stateful-notification-service). One zod schema per NotificationType keeps
// `payload` small, denormalized and render-ready: the web app builds the
// sentence from `type` + `payload` at read time, and the email channel renders
// from the same facts server-side (see event-email.ts).
import { z } from "zod";

export const NOTIFICATION_TYPES = [
  "NEW_INQUIRY",
  "THREAD_REPLY",
  "NEW_REVIEW",
  "REVIEW_RESPONSE",
  "VERIFICATION_APPROVED",
  "VERIFICATION_REJECTED",
  "NEW_JOB_MATCH",
  "JOB_RESPONSE",
  "SAVED_SEARCH_MATCH",
  "REPORT_RESOLVED",
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

// Display strings are user-controlled upstream (names, titles) — bound them so
// a hostile caller can't stuff megabytes into a payload row.
const name = z.string().min(1).max(200);

// Per-type payload contracts. `strictObject` rejects unknown keys so the
// stored rows stay exactly the documented shape (docs/api/internal.md).
export const PAYLOAD_SCHEMAS: Record<NotificationType, z.ZodType> = {
  NEW_INQUIRY: z.strictObject({ customerName: name }),
  THREAD_REPLY: z.strictObject({ senderName: name }),
  NEW_REVIEW: z.strictObject({
    reviewerName: name,
    rating: z.number().int().min(1).max(5),
  }),
  REVIEW_RESPONSE: z.strictObject({ providerName: name }),
  VERIFICATION_APPROVED: z.strictObject({}),
  VERIFICATION_REJECTED: z.strictObject({ reason: z.string().max(500).optional() }),
  NEW_JOB_MATCH: z.strictObject({ jobTitle: name, district: name }),
  JOB_RESPONSE: z.strictObject({ providerName: name, jobTitle: name }),
  SAVED_SEARCH_MATCH: z.strictObject({ providerName: name, district: name }),
  REPORT_RESOLVED: z.strictObject({
    targetType: name,
    status: z.enum(["RESOLVED", "DISMISSED"]),
  }),
};

// Fan-out cap — mirrors the existing /internal/email/new-job contract (and
// provider-service's MAX_MATCHING_PROVIDERS / MAX_ALERT_RECIPIENTS).
export const MAX_RECIPIENTS = 200;

const recipientSchema = z.object({
  userId: z.string().min(1).max(100),
  // Optional: recipients without an email get in-app only.
  email: z.string().email().optional(),
  name: z.string().max(200).optional(),
  locale: z.unknown().optional(),
});

// The event envelope. `link` is a RELATIVE path — the email channel rebuilds
// an absolute URL from the gateway's x-origin at ingestion time; in-app rows
// store it relative so the web renders same-origin links.
export const eventSchema = z.object({
  type: z.enum(NOTIFICATION_TYPES),
  recipients: z.array(recipientSchema).min(1).max(MAX_RECIPIENTS),
  payload: z.unknown(),
  link: z
    .string()
    .min(1)
    .max(500)
    .refine((v) => v.startsWith("/") && !v.startsWith("//"), {
      message: "link must be a relative path",
    }),
});

export type EventRecipient = z.infer<typeof recipientSchema>;

// Locale defaults to "en"; anything that isn't a known locale coerces to "en".
export function coerceLocale(value: unknown): "en" | "si" {
  return value === "si" ? "si" : "en";
}

// Dedupe recipients by userId (first entry wins), matching the "deduped by
// userId" ingestion contract.
export function dedupeRecipients(recipients: EventRecipient[]): EventRecipient[] {
  const seen = new Set<string>();
  const out: EventRecipient[] = [];
  for (const r of recipients) {
    if (seen.has(r.userId)) continue;
    seen.add(r.userId);
    out.push(r);
  }
  return out;
}
