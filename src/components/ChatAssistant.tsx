"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { FaCommentDots, FaPaperPlane, FaXmark } from "@/components/icons";
import { useT } from "@/components/I18nProvider";
import { localizedHref, pathLocale } from "@/lib/links";

// The assistant never sends an inquiry itself. It can only *propose* a draft
// (#202): the confirmation card below is rendered from this draft and the real
// inquiry is created out-of-band — by an explicit user tap that fires a normal
// authenticated same-origin POST, a path the model cannot invoke.
type InquiryDraft = {
  providerId: string;
  providerName: string;
  name: string;
  phone: string;
  message: string;
};

type ProposalStatus = "pending" | "sending" | "sent" | "error" | "cancelled";

type Msg =
  | { role: "user" | "assistant"; content: string }
  | { role: "proposal"; draft: InquiryDraft; status: ProposalStatus };

function setProposalStatus(
  list: Msg[],
  index: number,
  status: ProposalStatus
): Msg[] {
  const m = list[index];
  if (!m || m.role !== "proposal") return list;
  const next = [...list];
  next[index] = { ...m, status };
  return next;
}

// Floating chat assistant (#11): guests or signed-in customers describe a
// job; the assistant suggests providers and drafts an inquiry, which the
// customer sends themselves via the confirmation card. Talks to the web app's
// own /agent/chat route (SSE).
export default function ChatAssistant() {
  const t = useT();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages, open, busy]);

  // Focus management: the message box gets focus when the panel opens; the
  // launcher gets it back when the panel closes (Escape or toggle).
  useEffect(() => {
    if (open) {
      wasOpen.current = true;
      inputRef.current?.focus();
    } else if (wasOpen.current) {
      wasOpen.current = false;
      toggleRef.current?.focus();
    }
  }, [open]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;
    setFailed(false);
    setDraft("");
    const nextMessages: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(nextMessages);
    setBusy(true);

    try {
      // Request the /si-prefixed variant on Sinhala URLs so the route's
      // getLocale() sees the URL locale (proxy sets x-locale from the prefix),
      // matching the app's "URL prefix wins, then cookie" precedence — a
      // shared /si link gets Sinhala assistant replies, not English.
      const res = await fetch(localizedHref("/agent/chat", pathLocale(pathname)), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages }),
      });
      if (!res.ok || !res.body) throw new Error("chat failed");

      // Messages produced this turn. Text streams into an assistant bubble; a
      // "proposal" event inserts a confirmation card and closes the current
      // bubble so any following text starts a fresh one.
      const produced: Msg[] = [];
      let assistantIdx = -1;
      const flush = () => setMessages([...nextMessages, ...produced]);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const event = JSON.parse(line.slice(6)) as {
            type: string;
            text?: string;
            proposal?: InquiryDraft;
          };
          if (event.type === "text" && event.text) {
            if (assistantIdx === -1) {
              produced.push({ role: "assistant", content: "" });
              assistantIdx = produced.length - 1;
            }
            const cur = produced[assistantIdx] as {
              role: "assistant";
              content: string;
            };
            produced[assistantIdx] = {
              role: "assistant",
              content: cur.content + event.text,
            };
            flush();
          } else if (event.type === "proposal" && event.proposal) {
            produced.push({
              role: "proposal",
              draft: event.proposal,
              status: "pending",
            });
            assistantIdx = -1;
            flush();
          } else if (event.type === "error") {
            throw new Error("agent error");
          }
        }
      }
      const hasContent = produced.some(
        (m) =>
          m.role === "proposal" ||
          (m.role === "assistant" && m.content.trim() !== "")
      );
      if (!hasContent) throw new Error("empty response");
    } catch {
      setFailed(true);
      setMessages(nextMessages);
    } finally {
      setBusy(false);
    }
  }

  // The out-of-band confirmation (#202): sending is a user action, not the
  // model's. This POSTs the exact draft the card showed to the same
  // authenticated inquiry endpoint the plain InquiryForm uses.
  async function confirmProposal(index: number, draft: InquiryDraft) {
    setMessages((prev) => setProposalStatus(prev, index, "sending"));
    try {
      const res = await fetch(
        `/api/providers/${encodeURIComponent(draft.providerId)}/inquiries`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: draft.name,
            phone: draft.phone,
            message: draft.message,
            source: "chat-agent",
          }),
        }
      );
      if (!res.ok) throw new Error("send failed");
      setMessages((prev) => setProposalStatus(prev, index, "sent"));
    } catch {
      setMessages((prev) => setProposalStatus(prev, index, "error"));
    }
  }

  function cancelProposal(index: number) {
    setMessages((prev) => setProposalStatus(prev, index, "cancelled"));
  }

  return (
    <>
      <button
        ref={toggleRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={open ? t.assistant.close : t.assistant.open}
        className="fixed bottom-5 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-brand-600 text-white shadow-lg transition hover:bg-brand-700 dark:text-ink-50"
      >
        {open ? <FaXmark className="h-6 w-6" /> : <FaCommentDots className="h-6 w-6" />}
      </button>

      {open && (
        <div
          className="fixed bottom-24 right-5 z-40 flex h-[28rem] w-[min(24rem,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-2xl dark:border-ink-200 dark:bg-ink-50"
          role="dialog"
          aria-label={t.assistant.title}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
          }}
        >
          <div className="border-b border-ink-100 bg-brand-800 px-4 py-3 dark:border-ink-200 dark:bg-brand-600">
            <p className="font-semibold text-white dark:text-ink-50">
              {t.assistant.title}
            </p>
            <p className="text-xs text-white/90 dark:text-ink-50/90">
              {t.assistant.subtitle}
            </p>
          </div>

          <div
            role="log"
            aria-label={t.assistant.title}
            className="flex-1 space-y-3 overflow-y-auto px-4 py-3"
          >
            {messages.length === 0 && (
              <p className="rounded-2xl rounded-bl-sm bg-ink-100 px-4 py-2.5 text-sm text-ink-800">
                {t.assistant.greeting}
              </p>
            )}
            {messages.map((m, i) =>
              m.role === "proposal" ? (
                <div
                  key={i}
                  role="group"
                  aria-label={t.assistant.confirmTitle}
                  className="rounded-2xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm dark:border-ink-200 dark:bg-ink-100"
                >
                  <p className="font-semibold text-ink-900">
                    {t.assistant.confirmTitle}
                  </p>
                  <dl className="mt-2 space-y-1.5">
                    <div>
                      <dt className="text-xs font-medium text-ink-500">
                        {t.assistant.toLabel}
                      </dt>
                      <dd className="text-ink-800">
                        {m.draft.providerName || m.draft.providerId}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-ink-500">
                        {t.assistant.messageLabel}
                      </dt>
                      <dd className="whitespace-pre-line break-words text-ink-800">
                        {m.draft.message}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-ink-500">
                        {t.assistant.contactLabel}
                      </dt>
                      <dd className="text-ink-800">
                        {m.draft.name} · {m.draft.phone}
                      </dd>
                    </div>
                  </dl>
                  {m.status === "sent" ? (
                    <p className="mt-3 font-medium text-emerald-600">
                      {t.assistant.sent}
                    </p>
                  ) : m.status === "cancelled" ? (
                    <p className="mt-3 text-ink-500">{t.assistant.cancelled}</p>
                  ) : (
                    <>
                      {m.status === "error" && (
                        <p role="alert" className="mt-2 text-red-600">
                          {t.assistant.sendError}
                        </p>
                      )}
                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          onClick={() => confirmProposal(i, m.draft)}
                          disabled={m.status === "sending"}
                          className="btn-primary !px-3 !py-1.5 text-xs"
                        >
                          {m.status === "sending"
                            ? t.assistant.sending
                            : m.status === "error"
                              ? t.assistant.retry
                              : t.assistant.confirm}
                        </button>
                        <button
                          type="button"
                          onClick={() => cancelProposal(i)}
                          disabled={m.status === "sending"}
                          className="btn-ghost !px-3 !py-1.5 text-xs"
                        >
                          {t.assistant.cancel}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <div
                  key={i}
                  className={m.role === "user" ? "flex justify-end" : "flex justify-start"}
                >
                  <p
                    className={
                      m.role === "user"
                        ? "max-w-[85%] whitespace-pre-line break-words rounded-2xl rounded-br-sm bg-brand-600 px-4 py-2.5 text-sm text-white dark:text-ink-50"
                        : "max-w-[85%] whitespace-pre-line break-words rounded-2xl rounded-bl-sm bg-ink-100 px-4 py-2.5 text-sm text-ink-800"
                    }
                  >
                    {m.content || "…"}
                  </p>
                </div>
              )
            )}
            {failed && (
              <p role="alert" className="text-center text-xs text-red-600">
                {t.assistant.error}
              </p>
            )}
            <div ref={bottomRef} />
          </div>

          <form onSubmit={send} className="flex gap-2 border-t border-ink-100 p-3 dark:border-ink-200">
            <input
              ref={inputRef}
              className="input flex-1 !py-2 text-sm"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={t.assistant.placeholder}
              maxLength={1000}
              aria-label={t.assistant.placeholder}
            />
            <button
              type="submit"
              disabled={busy || draft.trim() === ""}
              className="btn-primary !px-3"
              aria-label={t.assistant.send}
            >
              <FaPaperPlane className="h-4 w-4" />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
