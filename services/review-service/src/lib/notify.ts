// Canonical shared helper — provider/review/job keep an identical copy at
// src/lib/notify.ts (services are self-contained; no shared package).
//
// Best-effort emitter for notification-service's generic event-ingestion
// endpoint (RFC: stateful-notification-service). The service validates the
// payload per type, writes the in-app rows inline, gates both channels on
// per-user preferences and queues the email sends, acking 202 before any
// delivery (#557) — so this call stays inside the s2s 5s budget.
// Fire-and-forget by contract: a notification failure must NEVER fail the
// triggering write, so every error is logged and swallowed here.
import { s2s } from "./http";
import { log } from "./log";

const NOTIFICATION_URL =
  process.env.NOTIFICATION_SERVICE_URL ?? "http://localhost:4005";

// Mirrors notification-service's catalog (its src/lib/events.ts) — payloads
// are zod-validated per type there; see docs/api/internal.md.
export type NotificationEventType =
  | "NEW_INQUIRY"
  | "THREAD_REPLY"
  | "NEW_REVIEW"
  | "REVIEW_RESPONSE"
  | "VERIFICATION_APPROVED"
  | "VERIFICATION_REJECTED"
  | "NEW_JOB_MATCH"
  | "JOB_RESPONSE"
  | "SAVED_SEARCH_MATCH"
  | "REPORT_RESOLVED";

export type NotificationRecipient = {
  userId: string;
  // Optional: recipients without an email get in-app only.
  email?: string;
  locale?: "en" | "si";
};

export async function emitNotification(event: {
  type: NotificationEventType;
  recipients: NotificationRecipient[];
  payload: Record<string, unknown>;
  // Relative path: in-app rows store it as-is; the email channel rebuilds an
  // absolute URL from `origin` (forwarded as x-origin).
  link: string;
  origin?: string;
}): Promise<void> {
  if (event.recipients.length === 0) return;
  const { origin, ...body } = event;
  try {
    await s2s(NOTIFICATION_URL, "/internal/notifications/events", {
      method: "POST",
      ...(origin ? { headers: { "x-origin": origin } } : {}),
      body: JSON.stringify(body),
    });
  } catch (e) {
    log.error("notification failed", { context: event.type, err: e });
  }
}
