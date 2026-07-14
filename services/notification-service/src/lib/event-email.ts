// Email rendering for catalog events: maps a NotificationType + its (already
// zod-validated) payload onto the bilingual templates in email.ts. Returns
// null for types with no email channel (REPORT_RESOLVED is in-app only in v1),
// so callers skip the enqueue entirely.
import {
  inquiryEmail,
  jobResponseEmail,
  newJobEmail,
  newProviderMatchEmail,
  newReviewEmail,
  reviewResponseEmail,
  threadReplyEmail,
  verificationApprovedEmail,
  verificationRejectedEmail,
  type Locale,
} from "./email";
import type { NotificationType } from "./events";

// Types with no email channel never get a job enqueued (ingestion checks this
// before building jobs; the render switch below is the worker-side guarantee).
export function hasEmailTemplate(type: NotificationType): boolean {
  return type !== "REPORT_RESOLVED";
}

// `payload` arrives re-parsed from a queue JSON string, so index it loosely —
// shapes were validated at ingestion (PAYLOAD_SCHEMAS) and the worker wraps
// rendering in a try/catch as a final guard against malformed legacy jobs.
type Payload = Record<string, unknown>;
const str = (v: unknown) => String(v ?? "");

export function renderEventEmail(
  type: NotificationType,
  payload: Payload,
  url: string,
  locale: Locale
): { subject: string; html: string } | null {
  switch (type) {
    case "NEW_INQUIRY":
      return inquiryEmail(url, str(payload.customerName), locale);
    case "THREAD_REPLY":
      return threadReplyEmail(url, str(payload.senderName), locale);
    case "NEW_REVIEW":
      return newReviewEmail(url, str(payload.reviewerName), Number(payload.rating), locale);
    case "REVIEW_RESPONSE":
      return reviewResponseEmail(url, str(payload.providerName), locale);
    case "VERIFICATION_APPROVED":
      return verificationApprovedEmail(url, locale);
    case "VERIFICATION_REJECTED":
      return verificationRejectedEmail(url, locale);
    case "NEW_JOB_MATCH":
      return newJobEmail(url, str(payload.jobTitle), str(payload.district), locale);
    case "JOB_RESPONSE":
      return jobResponseEmail(url, str(payload.providerName), str(payload.jobTitle), locale);
    case "SAVED_SEARCH_MATCH":
      return newProviderMatchEmail(url, str(payload.providerName), str(payload.district), locale);
    case "REPORT_RESOLVED":
      return null; // in-app only in v1 (no email template yet)
  }
}
