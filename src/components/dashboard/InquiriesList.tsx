"use client";

import Link from "next/link";
import { useState } from "react";
import { FaEnvelope, FaInbox, FaPhone } from "@/components/icons";
import EmptyState from "@/components/ui/EmptyState";
import { useLocale, useT } from "../I18nProvider";
import { useToast } from "../ToastProvider";
import { localizedHref } from "@/lib/links";
import { formatDate } from "@/lib/format";
import type { InquiryItem } from "./DashboardTabs";

const STATUS_STYLES: Record<string, string> = {
  NEW: "bg-brand-50 text-brand-700 ring-brand-200",
  RESPONDED: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  CLOSED: "bg-ink-100 text-ink-500 ring-ink-200",
};

// Matches DASHBOARD_INQUIRIES_TAKE in provider-service — the dashboard embeds
// page 1, and "load more" pages through GET /api/provider/inquiries (#372).
const PAGE_SIZE = 20;

export default function InquiriesList({
  initial,
  total: initialTotal,
}: {
  initial: InquiryItem[];
  total?: number;
}) {
  const [inquiries, setInquiries] = useState(initial);
  const [total, setTotal] = useState(initialTotal ?? initial.length);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const t = useT();
  const toast = useToast();
  const q = t.dashboard.inquiries;
  const locale = useLocale();
  const statusLabel: Record<string, string> = {
    NEW: q.statusNew,
    RESPONDED: q.statusResponded,
    CLOSED: q.statusClosed,
  };

  async function loadMore() {
    setLoading(true);
    setLoadError(false);
    try {
      const res = await fetch(
        `/api/provider/inquiries?page=${page + 1}&pageSize=${PAGE_SIZE}`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: { inquiries: InquiryItem[]; total: number } = await res.json();
      setInquiries((list) => {
        const seen = new Set(list.map((i) => i.id));
        return [...list, ...data.inquiries.filter((i) => !seen.has(i.id))];
      });
      setTotal(data.total);
      setPage((p) => p + 1);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }

  async function setStatus(id: string, status: string) {
    const res = await fetch(`/api/provider/inquiries/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    }).catch(() => null);
    if (res && res.ok) {
      setInquiries((list) =>
        list.map((i) => (i.id === id ? { ...i, status } : i))
      );
    } else {
      toast.error(t.toast.inquiryStatusError);
    }
  }

  if (inquiries.length === 0) {
    return <EmptyState icon={FaInbox} title={q.emptyTitle} body={q.emptyBody} />;
  }

  return (
    <>
    <ul className="space-y-4">
      {inquiries.map((i) => (
        <li key={i.id} className="card p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-semibold text-ink-900">{i.name}</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-500">
                <a
                  href={`tel:${i.phone}`}
                  className="inline-flex items-center gap-1.5 font-medium text-brand-700 hover:underline"
                >
                  <FaPhone className="h-3 w-3" />
                  {i.phone}
                </a>
                {i.email && (
                  <>
                    <span className="text-ink-300">·</span>
                    <a
                      href={`mailto:${i.email}`}
                      className="inline-flex items-center gap-1.5 font-medium text-brand-700 hover:underline"
                    >
                      <FaEnvelope className="h-3 w-3" />
                      {i.email}
                    </a>
                  </>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`rounded-full px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] ring-1 ${STATUS_STYLES[i.status] ?? STATUS_STYLES.NEW}`}
              >
                {statusLabel[i.status] ?? i.status}
              </span>
              <span className="font-mono text-xs tabular-nums text-ink-500">
                {formatDate(i.createdAt, locale, { day: "numeric", month: "short" })}
              </span>
            </div>
          </div>
          <p className="mt-3 whitespace-pre-line rounded-lg border border-dashed border-ink-200 bg-ink-50 p-3 text-sm leading-relaxed text-ink-700">
            {i.message}
          </p>
          <div className="mt-3 flex items-center gap-2">
            <Link
              href={localizedHref(`/dashboard/inquiries/${i.id}`, locale)}
              className="btn-secondary !px-3 !py-1.5 !text-xs"
            >
              {t.messages.open}
            </Link>
            {(i.unreadCount ?? 0) > 0 && (
              <span className="chip bg-brand-600 text-white">
                {t.messages.unread(i.unreadCount ?? 0)}
              </span>
            )}
            {i.status !== "RESPONDED" && (
              <button
                onClick={() => setStatus(i.id, "RESPONDED")}
                className="btn-secondary !px-3 !py-1.5 !text-xs"
              >
                {q.markResponded}
              </button>
            )}
            {i.status !== "CLOSED" && (
              <button
                onClick={() => setStatus(i.id, "CLOSED")}
                className="btn-ghost !px-3 !py-1.5 !text-xs"
              >
                {q.close}
              </button>
            )}
            {i.status === "CLOSED" && (
              <button
                onClick={() => setStatus(i.id, "NEW")}
                className="btn-ghost !px-3 !py-1.5 !text-xs"
              >
                {q.reopen}
              </button>
            )}
          </div>
        </li>
      ))}
    </ul>
    {inquiries.length < total && (
      <div className="mt-6 flex flex-col items-center gap-2">
        <button
          onClick={loadMore}
          disabled={loading}
          className="btn-secondary"
        >
          {loading ? q.loadingMore : q.loadMore(total - inquiries.length)}
        </button>
        {loadError && (
          <p role="alert" className="text-sm text-red-600">
            {q.loadMoreError}
          </p>
        )}
      </div>
    )}
    </>
  );
}
