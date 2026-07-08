"use client";

import { useEffect, useRef, useState } from "react";
import { FaCommentDots, FaPaperPlane, FaXmark } from "@/components/icons";
import { useT } from "@/components/I18nProvider";

type Msg = { role: "user" | "assistant"; content: string };

// Floating chat assistant (#11): guests or signed-in customers describe a
// job; the assistant suggests providers and, after confirmation, sends the
// inquiry for them. Talks to the web app's own /agent/chat route (SSE).
export default function ChatAssistant() {
  const t = useT();
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
      const res = await fetch("/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages }),
      });
      if (!res.ok || !res.body) throw new Error("chat failed");

      let assistant = "";
      setMessages([...nextMessages, { role: "assistant", content: "" }]);
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
          };
          if (event.type === "text" && event.text) {
            assistant += event.text;
            setMessages([
              ...nextMessages,
              { role: "assistant", content: assistant },
            ]);
          } else if (event.type === "error") {
            throw new Error("agent error");
          }
        }
      }
      if (assistant.trim() === "") throw new Error("empty response");
    } catch {
      setFailed(true);
      setMessages(nextMessages);
    } finally {
      setBusy(false);
    }
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
            {messages.map((m, i) => (
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
            ))}
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
