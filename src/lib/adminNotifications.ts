// Client-side "new since last viewed" bookkeeping for the admin hub
// notification badges (#233). The count endpoints only expose current
// totals (GET /api/admin/notifications/counts, GET
// /api/admin/review-reports/count) — there's no per-item "created since X"
// filter — so precise "new since last viewed" isn't available. We
// approximate it instead: remember the queue size the last time the admin
// opened /admin/verifications or /admin/reports, and treat any increase
// above that baseline as "new" on the hub badge.
//
// Deliberately localStorage-only (no server round trip): this is a per-admin,
// per-browser convenience, not shared state.

export type NotificationQueue = "verifications" | "reports";

// Keys match the queue names the issue calls out (lastViewedVerifications /
// lastViewedReports) plus a companion "count at last view" used for the
// count-difference approximation above.
const STORAGE_KEYS: Record<NotificationQueue, { viewedAt: string; seenCount: string }> = {
  verifications: {
    viewedAt: "lastViewedVerifications",
    seenCount: "lastViewedVerificationsCount",
  },
  reports: {
    viewedAt: "lastViewedReports",
    seenCount: "lastViewedReportsCount",
  },
};

// Call when the admin opens a queue page: records "now" plus how many items
// were in it, so the hub badge can later tell a genuinely new arrival apart
// from a total the admin has already looked at.
export function markQueueViewed(queue: NotificationQueue, count: number): void {
  if (typeof window === "undefined") return;
  const keys = STORAGE_KEYS[queue];
  try {
    window.localStorage.setItem(keys.viewedAt, new Date().toISOString());
    window.localStorage.setItem(keys.seenCount, String(count));
  } catch {
    // localStorage unavailable (private mode, quota, disabled) — the badge
    // just won't distinguish "new" from "already seen"; not worth surfacing.
  }
}

// The queue size the admin last saw, or null if they've never opened it
// (or storage isn't available) — null means "no baseline yet."
export function getSeenCount(queue: NotificationQueue): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS[queue].seenCount);
    if (raw === null) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}
