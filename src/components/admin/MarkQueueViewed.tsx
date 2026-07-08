"use client";

import { useEffect } from "react";
import { markQueueViewed, type NotificationQueue } from "@/lib/adminNotifications";

// Records that the admin just opened this queue (#233), so the hub's
// notification badge (NotificationBadge.tsx) can tell new arrivals apart
// from a total the admin has already seen. Renders nothing — mount-only
// side effect, one instance per queue page (verifications, reports).
export default function MarkQueueViewed({
  queue,
  count,
}: {
  queue: NotificationQueue;
  count: number;
}) {
  useEffect(() => {
    markQueueViewed(queue, count);
  }, [queue, count]);

  return null;
}
