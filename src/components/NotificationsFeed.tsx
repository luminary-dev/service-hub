"use client";

import Link from "next/link";
import { useState } from "react";
import { FaBell } from "@/components/icons";
import EmptyState from "@/components/ui/EmptyState";
import { formatDate } from "@/lib/format";
import { localizedHref } from "@/lib/links";
import { notificationText, type NotificationDTO } from "@/lib/notifications";
import { useLocale, useT } from "./I18nProvider";
import { useToast } from "./ToastProvider";

const PAGE_TAKE = 20;

// The /account/notifications feed (#394): the server page hands over the
// first page; older pages are appended via the API's cursor ("Show older" —
// a cursor feed has no page count for the shared <Pagination>). Sentences
// are rendered client-side from type + payload so an EN↔SI switch
// re-renders the whole feed in the new language. A row is marked read when
// its link is followed; "Mark all as read" clears the backlog.
export default function NotificationsFeed({
  initial,
  initialCursor,
}: {
  initial: NotificationDTO[];
  initialCursor: string | null;
}) {
  const t = useT().notifications;
  const locale = useLocale();
  const toast = useToast();
  const [items, setItems] = useState(initial);
  const [cursor, setCursor] = useState(initialCursor);
  const [loadingMore, setLoadingMore] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);

  const unreadCount = items.filter((n) => !n.readAt).length;

  async function markAllRead() {
    if (markingAll) return;
    setMarkingAll(true);
    const res = await fetch("/api/notifications/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    }).catch(() => null);
    setMarkingAll(false);
    if (!res || !res.ok) {
      toast.error(t.markError);
      return;
    }
    const now = new Date().toISOString();
    setItems((prev) => prev.map((n) => (n.readAt ? n : { ...n, readAt: now })));
    toast.success(t.allRead);
  }

  // Following a link marks that row read — fire-and-forget (the destination
  // navigation must never wait on it), optimistic in the local list.
  function markOneRead(n: NotificationDTO) {
    if (n.readAt) return;
    const now = new Date().toISOString();
    setItems((prev) =>
      prev.map((x) => (x.id === n.id ? { ...x, readAt: now } : x))
    );
    void fetch("/api/notifications/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [n.id] }),
    }).catch(() => null);
  }

  async function loadMore() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    const res = await fetch(
      `/api/notifications?take=${PAGE_TAKE}&cursor=${encodeURIComponent(cursor)}`,
      { cache: "no-store" }
    ).catch(() => null);
    setLoadingMore(false);
    const data =
      res && res.ok
        ? ((await res.json().catch(() => null)) as {
            notifications?: NotificationDTO[];
            nextCursor?: string | null;
          } | null)
        : null;
    const next = data?.notifications;
    if (!next) {
      toast.error(t.loadError);
      return;
    }
    setItems((prev) => [...prev, ...next]);
    setCursor(data.nextCursor ?? null);
  }

  if (items.length === 0) {
    return (
      <EmptyState icon={FaBell} title={t.feedEmpty} body={t.feedEmptyBody} />
    );
  }

  return (
    <div>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={markAllRead}
          disabled={markingAll || unreadCount === 0}
          className="btn-secondary disabled:cursor-not-allowed disabled:opacity-60"
        >
          {markingAll ? t.markingAll : t.markAllRead}
        </button>
      </div>

      <ul className="mt-4 space-y-3">
        {items.map((n) => {
          const unread = !n.readAt;
          return (
            <li
              key={n.id}
              className={`tech-corners card p-4 ${
                unread ? "border-brand-300 bg-brand-50/40" : ""
              }`}
            >
              <Link
                href={localizedHref(n.link, locale)}
                onClick={() => markOneRead(n)}
                className="group block focus-visible:outline-none"
              >
                <span className="flex items-start gap-2.5">
                  {unread && (
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-600">
                      <span className="sr-only">{t.unread}: </span>
                    </span>
                  )}
                  <span
                    className={`text-sm leading-relaxed group-hover:text-brand-700 ${
                      unread ? "font-medium text-ink-900" : "text-ink-600"
                    }`}
                  >
                    {notificationText(n, locale)}
                  </span>
                </span>
                <span className="mt-1.5 block pl-[18px] font-mono text-xs tabular-nums text-ink-500">
                  {formatDate(n.createdAt, locale)}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      {cursor && (
        <div className="mt-8 flex justify-center">
          <button
            type="button"
            onClick={loadMore}
            disabled={loadingMore}
            className="btn-secondary disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loadingMore ? t.loadingMore : t.loadMore}
          </button>
        </div>
      )}
    </div>
  );
}
