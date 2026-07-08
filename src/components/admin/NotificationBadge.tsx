"use client";

import { useEffect, useState } from "react";
import { useT } from "../I18nProvider";
import { getSeenCount, type NotificationQueue } from "@/lib/adminNotifications";

type Counts = { verifications: number; reports: number };

// Provider-service owns pending-verification and provider/photo report
// counts; review-service owns the review-report count separately (same split
// as the reports page's two-service merge). Summed here into one "reports"
// total for the badge.
async function fetchCounts(): Promise<Counts> {
  const [notifRes, reviewRes] = await Promise.all([
    fetch("/api/admin/notifications/counts", { cache: "no-store" }).catch(() => null),
    fetch("/api/admin/review-reports/count", { cache: "no-store" }).catch(() => null),
  ]);
  const notif =
    notifRes && notifRes.ok
      ? ((await notifRes.json()) as { pendingVerifications: number; openReports: number })
      : null;
  const review =
    reviewRes && reviewRes.ok ? ((await reviewRes.json()) as { openReports: number }) : null;

  return {
    verifications: notif?.pendingVerifications ?? 0,
    reports: (notif?.openReports ?? 0) + (review?.openReports ?? 0),
  };
}

// Numeric badge for the admin hub's Verifications/Reports nav cards (#233).
// Fetched on mount and refreshed whenever the tab regains focus — no
// polling, no websockets, just enough to catch up after switching back in.
//
// "New since last viewed" is approximated by count difference (see
// src/lib/adminNotifications.ts): the count endpoints only return current
// totals, not per-item timestamps, so a total higher than what the admin
// last saw on that queue page gets a brighter "new" treatment; otherwise the
// badge is a plain count.
export default function NotificationBadge({ queue }: { queue: NotificationQueue }) {
  const t = useT().admin;
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const counts = await fetchCounts();
      if (cancelled) return;
      setCount(queue === "verifications" ? counts.verifications : counts.reports);
    }
    load();
    window.addEventListener("focus", load);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", load);
    };
  }, [queue]);

  if (!count) return null;

  const seen = getSeenCount(queue);
  const isNew = seen === null ? count > 0 : count > seen;
  const label = isNew ? t.notificationsNewAria(count) : t.notificationsCountAria(count);

  return (
    <span
      role="status"
      aria-label={label}
      title={label}
      className={
        "ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold " +
        (isNew
          ? "bg-red-100 text-red-700 ring-1 ring-red-200"
          : "bg-ink-100 text-ink-600")
      }
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
