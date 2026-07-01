"use client";

import { useState } from "react";
import type { InquiryItem } from "./DashboardTabs";

const STATUS_STYLES: Record<string, string> = {
  NEW: "bg-brand-50 text-brand-700 ring-brand-200",
  RESPONDED: "bg-blue-50 text-blue-700 ring-blue-200",
  CLOSED: "bg-ink-100 text-ink-500 ring-ink-200",
};

export default function InquiriesList({ initial }: { initial: InquiryItem[] }) {
  const [inquiries, setInquiries] = useState(initial);

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
        <span className="text-4xl">📭</span>
        <h2 className="mt-3 font-semibold text-ink-900">No inquiries yet</h2>
        <p className="mt-1 max-w-sm text-sm text-ink-500">
          When customers send you an inquiry from your profile, it will show up
          here with their contact details.
        </p>
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
              <p className="mt-0.5 text-sm text-ink-500">
                📞{" "}
                <a
                  href={`tel:${i.phone}`}
                  className="font-medium text-brand-700 hover:underline"
                >
                  {i.phone}
                </a>
                {i.email && (
                  <>
                    {" "}
                    · ✉️{" "}
                    <a
                      href={`mailto:${i.email}`}
                      className="font-medium text-brand-700 hover:underline"
                    >
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
                {i.status}
              </span>
              <span className="text-xs text-ink-400">
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
                Mark responded
              </button>
            )}
            {i.status !== "CLOSED" && (
              <button
                onClick={() => setStatus(i.id, "CLOSED")}
                className="btn-ghost !px-3 !py-1.5 !text-xs"
              >
                Close
              </button>
            )}
            {i.status === "CLOSED" && (
              <button
                onClick={() => setStatus(i.id, "NEW")}
                className="btn-ghost !px-3 !py-1.5 !text-xs"
              >
                Reopen
              </button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
