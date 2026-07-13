"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useT } from "@/components/I18nProvider";
import { formatDate } from "@/lib/format";
import ReportButton from "@/components/ReportButton";

type Message = {
  id: string;
  sender: "CUSTOMER" | "PROVIDER";
  body: string;
  createdAt: string;
};

type ThreadPayload = {
  party: "CUSTOMER" | "PROVIDER";
  inquiry: {
    id: string;
    status: string;
    message: string;
    createdAt: string;
    customerName: string;
    provider: { id: string; name: string };
  };
  messages: Message[];
};

const POLL_MS = 5000;

// Polling thread view (#13): full fetch on mount, incremental ?after= fetches
// on an interval while mounted. Sends are optimistic-free (simple await —
// message volume is low and the POST returns the stored row).
export default function MessageThread({ inquiryId }: { inquiryId: string }) {
  const t = useT();
  const locale = useLocale();
  const [thread, setThread] = useState<ThreadPayload | null>(null);
  const [error, setError] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState(false);
  const lastSeenRef = useRef<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const after = lastSeenRef.current;
    const res = await fetch(
      `/api/inquiries/${inquiryId}/messages${after ? `?after=${encodeURIComponent(after)}` : ""}`
    );
    if (!res.ok) {
      if (!after) setError(true);
      return;
    }
    const data = (await res.json()) as ThreadPayload;
    setThread((prev) => {
      if (!prev || !after) {
        if (data.messages.length > 0) {
          lastSeenRef.current = data.messages[data.messages.length - 1].createdAt;
        }
        return data;
      }
      if (data.messages.length === 0) return prev;
      const known = new Set(prev.messages.map((m) => m.id));
      const fresh = data.messages.filter((m) => !known.has(m.id));
      if (fresh.length === 0) return prev;
      lastSeenRef.current = fresh[fresh.length - 1].createdAt;
      return { ...prev, messages: [...prev.messages, ...fresh] };
    });
  }, [inquiryId]);

  useEffect(() => {
    load();
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [thread?.messages.length]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setSendError(false);
    const res = await fetch(`/api/inquiries/${inquiryId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });
    setSending(false);
    if (!res.ok) {
      setSendError(true);
      return;
    }
    const data = (await res.json()) as { message: Message };
    setDraft("");
    lastSeenRef.current = data.message.createdAt;
    setThread((prev) =>
      prev ? { ...prev, messages: [...prev.messages, data.message] } : prev
    );
  }

  if (error) {
    return (
      <p role="alert" className="text-sm text-red-600">
        {t.messages.loadFailed}
      </p>
    );
  }
  if (!thread) {
    return (
      <div className="tech-corners animate-pulse rounded-lg border border-ink-300 bg-surface p-6">
        <div className="h-4 w-1/3 rounded bg-ink-100" />
        <div className="mt-4 h-16 rounded bg-ink-100" />
      </div>
    );
  }

  const counterpart =
    thread.party === "CUSTOMER"
      ? thread.inquiry.provider.name
      : thread.inquiry.customerName;

  return (
    <div className="tech-corners flex min-h-[50vh] flex-col overflow-hidden rounded-lg border border-ink-300 bg-surface">
      <div className="flex items-center gap-2 border-b border-ink-200 bg-ink-100 px-5 py-3">
        <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-brand-600" />
        <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-700">
          {t.messages.threadWith(counterpart)}
        </h2>
      </div>

      <div
        role="log"
        aria-label={t.messages.threadWith(counterpart)}
        className="flex-1 space-y-3 overflow-y-auto px-5 py-4"
      >
        <div className="rounded-sm border border-ink-300 bg-ink-50 px-4 py-3 text-sm text-ink-600">
          <p className="mb-1 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-brand-700">
            {t.messages.original} · {formatDate(thread.inquiry.createdAt, locale)}
          </p>
          <p className="whitespace-pre-line">{thread.inquiry.message}</p>
        </div>

        {thread.messages.length === 0 && (
          <p className="py-6 text-center text-sm text-ink-500">
            {t.messages.empty}
          </p>
        )}

        {thread.messages.map((m) => {
          const mine = m.sender === thread.party;
          return (
            <div key={m.id} className={mine ? "flex justify-end" : "flex items-end justify-start gap-1.5"}>
              <div
                className={
                  mine
                    ? "max-w-[80%] rounded-2xl rounded-br-sm bg-brand-800 px-4 py-2.5 text-sm text-white dark:bg-brand-600 dark:text-ink-50"
                    : "max-w-[80%] rounded-2xl rounded-bl-sm bg-ink-100 px-4 py-2.5 text-sm text-ink-800"
                }
              >
                <p className="whitespace-pre-line break-words">{m.body}</p>
                <p
                  className={`mt-1 font-mono text-[11px] tabular-nums ${mine ? "text-white/90 dark:text-ink-50/90" : "text-ink-500"}`}
                >
                  {mine ? t.messages.you : counterpart} ·{" "}
                  {formatDate(m.createdAt, locale, {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
              {/* Abuse reporting (#376): only the counterpart's messages are
                  reportable — reporting your own makes no sense. */}
              {!mine && (
                <ReportButton
                  endpoint={`/api/messages/${m.id}/report`}
                  label={t.report.reportMessage}
                  showLabel={false}
                />
              )}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={send} className="flex gap-2 border-t border-ink-200 bg-ink-50 p-4">
        <input
          className="input flex-1"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t.messages.placeholder}
          maxLength={2000}
          aria-label={t.messages.placeholder}
        />
        <button type="submit" disabled={sending || draft.trim() === ""} className="btn-primary">
          {sending ? t.messages.sending : t.messages.send}
        </button>
      </form>
      {sendError && (
        <p role="alert" className="px-4 pb-3 text-sm text-red-600">
          {t.messages.sendFailed}
        </p>
      )}
    </div>
  );
}
