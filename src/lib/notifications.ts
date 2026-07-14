import { dict, type Locale, type NotificationPayload } from "./i18n";

// In-app notification center (#394, RFC stateful-notification-service):
// shared shapes + the read-time sentence renderer used by the navbar bell
// (NotificationBell) and the /account/notifications feed (NotificationsFeed).
// Client-safe (no next/headers).

// The catalog, mirroring notification-service's NotificationType enum. Used
// to order the preferences matrix; the API is authoritative for what exists.
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

// One row of GET /api/notifications. `type` stays a plain string so a feed
// containing a type this build doesn't know yet (deployed mid-rollout)
// renders the generic fallback line instead of crashing.
export type NotificationDTO = {
  id: string;
  type: string;
  payload: NotificationPayload | null;
  link: string;
  readAt: string | null;
  createdAt: string;
};

// One row of GET /api/notification-preferences (defaults merged over the
// user's sparse overrides — one entry per catalog type).
export type NotificationPreferenceDTO = {
  type: string;
  emailEnabled: boolean;
  inAppEnabled: boolean;
};

// Renders the notification sentence from type + payload in the given locale
// (RFC: "render at read time, store data not prose"). Unknown types and
// malformed payloads degrade to the generic fallback line.
export function notificationText(
  n: Pick<NotificationDTO, "type" | "payload">,
  locale: Locale
): string {
  const t = dict[locale].notifications;
  const render = (
    t.render as Record<string, (p: NotificationPayload) => string>
  )[n.type];
  if (!render) return t.fallback;
  const payload =
    n.payload && typeof n.payload === "object" ? n.payload : {};
  return render(payload);
}

// Localized display label for a catalog type (preferences rows). Unknown
// types fall back to the raw enum value rather than disappearing.
export function notificationTypeLabel(type: string, locale: Locale): string {
  const labels = dict[locale].notifications.typeLabels as Record<
    string,
    string
  >;
  return labels[type] ?? type;
}
