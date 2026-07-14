"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { FaBell } from "@/components/icons";
import { Skeleton } from "@/components/ui/Skeleton";
import { formatDate } from "@/lib/format";
import { localizedHref } from "@/lib/links";
import { notificationText, type NotificationDTO } from "@/lib/notifications";
import { useLocale, useT } from "./I18nProvider";

// The in-app notification center's engagement loop is refetch, not push
// (RFC stateful-notification-service: no websockets/SSE in v0.1): the badge
// loads on mount, refreshes when the tab regains focus (like
// admin/NotificationBadge), and slow-polls while the tab is visible.
const POLL_MS = 60_000;
const DROPDOWN_TAKE = 10;

// Navbar bell for signed-in users (#394): unread badge from
// GET /api/notifications/unread-count, and a dropdown of the latest
// notifications which are marked read on open. Degrades to hidden until the
// count endpoint has answered once — a bell that can't answer never renders
// (same fail-soft posture as FavoriteButton).
export default function NotificationBell() {
  const t = useT().notifications;
  const locale = useLocale();
  const [count, setCount] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  // null = loading; [] + feedError = the dropdown fetch failed.
  const [items, setItems] = useState<NotificationDTO[] | null>(null);
  const [feedError, setFeedError] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const res = await fetch("/api/notifications/unread-count", {
        cache: "no-store",
      }).catch(() => null);
      if (cancelled || !res || !res.ok) return;
      const data = (await res.json().catch(() => null)) as {
        count?: number;
      } | null;
      if (!cancelled && typeof data?.count === "number") setCount(data.count);
    }
    load();
    window.addEventListener("focus", load);
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, POLL_MS);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", load);
      clearInterval(timer);
    };
  }, []);

  // Close on click outside, same as UserMenu.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  async function openDropdown() {
    setOpen(true);
    setItems(null);
    setFeedError(false);
    const res = await fetch(`/api/notifications?take=${DROPDOWN_TAKE}`, {
      cache: "no-store",
    }).catch(() => null);
    const data =
      res && res.ok
        ? ((await res.json().catch(() => null)) as {
            notifications?: NotificationDTO[];
          } | null)
        : null;
    if (!data?.notifications) {
      setFeedError(true);
      setItems([]);
      return;
    }
    setItems(data.notifications);

    // Mark what the dropdown shows as read (RFC: mark-read on open). The
    // rows keep their unread dot for this open, so the user still sees what
    // was new; the badge drops once the write is confirmed.
    const unreadIds = data.notifications
      .filter((n) => !n.readAt)
      .map((n) => n.id);
    if (unreadIds.length === 0) return;
    const marked = await fetch("/api/notifications/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: unreadIds }),
    }).catch(() => null);
    if (marked?.ok) {
      setCount((c) => Math.max(0, (c ?? 0) - unreadIds.length));
    }
  }

  if (count === null) return null;

  const label = count > 0 ? t.bellUnread(count) : t.bell;
  const itemLink =
    "block rounded-md px-3 py-2.5 transition-colors duration-200 ease-snap hover:bg-ink-100";

  return (
    <div
      className="relative"
      ref={ref}
      // Escape closes the dropdown and returns focus to the trigger.
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          setOpen(false);
          triggerRef.current?.focus();
        }
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? setOpen(false) : openDropdown())}
        aria-expanded={open}
        aria-label={label}
        title={label}
        className="relative flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-ink-200 bg-ink-100 text-ink-600 transition-[background-color,color] duration-200 ease-snap hover:bg-ink-200 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 dark:text-ink-300"
      >
        <FaBell aria-hidden className="h-4 w-4" />
        {count > 0 && (
          <span
            aria-hidden
            className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 font-mono text-[10px] font-semibold tabular-nums text-white dark:text-ink-50"
          >
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>
      {/* Announces badge updates (mount, focus refresh, poll) without
          re-reading the whole control; empty when everything is read. */}
      <span role="status" className="sr-only">
        {count > 0 ? t.unreadStatus(count) : ""}
      </span>

      {open && (
        <div className="card absolute right-0 mt-2 w-80 overflow-hidden p-1 shadow-lg sm:w-96">
          <div className="flex items-center justify-between gap-3 border-b border-ink-200 px-3 py-2.5">
            <span className="font-display text-sm font-semibold text-ink-900">
              {t.bell}
            </span>
            <Link
              href={localizedHref("/account/notifications", locale)}
              onClick={() => setOpen(false)}
              className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-brand-600 hover:text-brand-700"
            >
              {t.viewAll}
            </Link>
          </div>

          {items === null ? (
            <div className="animate-pulse space-y-2 p-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i}>
                  <Skeleton tone="strong" className="h-3.5 w-56 rounded" />
                  <Skeleton className="mt-1.5 h-3 w-24 rounded" />
                </div>
              ))}
            </div>
          ) : feedError ? (
            <p className="px-3 py-6 text-center text-sm text-ink-500">
              {t.loadError}
            </p>
          ) : items.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-ink-500">
              {t.empty}
            </p>
          ) : (
            <ul className="max-h-96 overflow-y-auto py-1">
              {items.map((n) => (
                <li key={n.id}>
                  <Link
                    href={localizedHref(n.link, locale)}
                    onClick={() => setOpen(false)}
                    className={itemLink}
                  >
                    <span className="flex items-start gap-2">
                      {!n.readAt && (
                        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-600">
                          <span className="sr-only">{t.unread}: </span>
                        </span>
                      )}
                      <span
                        className={`line-clamp-2 text-sm leading-snug ${
                          n.readAt ? "text-ink-600" : "font-medium text-ink-900"
                        }`}
                      >
                        {notificationText(n, locale)}
                      </span>
                    </span>
                    <span className="mt-1 block pl-4 font-mono text-xs tabular-nums text-ink-500">
                      {formatDate(n.createdAt, locale)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
