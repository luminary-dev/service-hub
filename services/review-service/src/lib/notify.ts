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
import { Counter, register } from "prom-client";
import { s2s } from "./http";
import { log } from "./log";

const NOTIFICATION_URL =
  process.env.NOTIFICATION_SERVICE_URL ?? "http://localhost:4005";

// #750: notification-service rejections were dropped silently — s2s returns a
// Response even on a 4xx/5xx (it never throws for a non-ok status), so the old
// unchecked `await` swallowed every rejected batch with zero log lines. Count
// failures so a sustained rejection rate is alertable off the /metrics scrape.
// `reason` separates a non-2xx ack ("status") from a transport error/timeout
// ("transport"). getOrCreate-guarded so a re-import (tests) never throws
// "already registered" on the default registry metrics.ts also uses.
const notificationFailures =
  (register.getSingleMetric("notification_emit_failures_total") as Counter<
    "type" | "reason"
  >) ??
  new Counter({
    name: "notification_emit_failures_total",
    help: "Notification events the emitter failed to hand off to notification-service, by event type and failure reason.",
    labelNames: ["type", "reason"],
  });

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
    const res = await s2s(NOTIFICATION_URL, "/internal/notifications/events", {
      method: "POST",
      ...(origin ? { headers: { "x-origin": origin } } : {}),
      body: JSON.stringify(body),
    });
    // #750: a non-2xx (notification-service DB down → 500, or a payload out of
    // its strict zod schema → 400) is neither logged nor retried by s2s on a
    // write, so check it here. Logged and swallowed — the "logged and swallowed"
    // contract at the top of this file requires the log line so ops can detect
    // the outage; the triggering write must still never fail. Mirrors
    // saved-search-alerts.ts's res.ok check (#636).
    if (!res.ok) {
      notificationFailures.inc({ type: event.type, reason: "status" });
      log.error("notification rejected", {
        context: event.type,
        type: event.type,
        recipientCount: event.recipients.length,
        status: res.status,
      });
    }
  } catch (e) {
    notificationFailures.inc({ type: event.type, reason: "transport" });
    log.error("notification failed", { context: event.type, err: e });
  }
}
