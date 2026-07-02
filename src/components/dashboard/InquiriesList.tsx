"use client";

import { useState } from "react";
import { FaEnvelope, FaInbox, FaPhone } from "react-icons/fa6";
import { useT } from "../I18nProvider";
import type { InquiryItem } from "./DashboardTabs";

const STATUS_STYLES: Record<string, string> = {
  NEW: "bg-brand-50 text-brand-700 ring-brand-200",
  RESPONDED: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  CLOSED: "bg-ink-100 text-ink-500 ring-ink-200",
};

export default function InquiriesList({ initial }: { initial: InquiryItem[] }) {
  const [inquiries, setInquiries] = useState(initial);
  const q = useT().dashboard.inquiries;
  const statusLabel: Record<string, string> = {
    NEW: q.statusNew,
    RESPONDED: q.statusResponded,
    CLOSED: q.statusClosed,
  };

  async function setStatus(id: string, status: string) {
    const res = await fetch(`/api/provider/inquiries/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      setInquiries((list) =>
        list.map((i) => (i.id === id ? { ...i, status } : i))
      );
    }
  }

  if (inquiries.length === 0) {
    return (
      <div className="card flex flex-col items-center p-12 text-center">
        <FaInbox className="h-10 w-10 text-ink-300" />
        <h2 className="mt-3 font-semibold text-ink-900">{q.emptyTitle}</h2>
        <p className="mt-1 max-w-sm text-sm text-ink-500">{q.emptyBody}</p>
      </div>
    );
  }

  return (
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
                className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${STATUS_STYLES[i.status] ?? STATUS_STYLES.NEW}`}
              >
                {statusLabel[i.status] ?? i.status}
              </span>
              <span className="text-xs text-ink-500">
                {new Date(i.createdAt).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "short",
                })}
              </span>
            </div>
          </div>
          <p className="mt-3 whitespace-pre-line rounded-xl bg-ink-50 p-3 text-sm leading-relaxed text-ink-700">
            {i.message}
          </p>
          <div className="mt-3 flex gap-2">
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
  );
}
