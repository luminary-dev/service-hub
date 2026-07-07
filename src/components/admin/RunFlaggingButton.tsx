"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "../I18nProvider";

// Manual trigger for the automated flagging rule (#232): provider-service has
// no cron/worker infra, so POST /api/admin/flagging/run is admin-triggered
// here rather than scheduled. A real cron can call the same endpoint once one
// exists.
export default function RunFlaggingButton() {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const t = useT().admin;
  const router = useRouter();

  async function run() {
    setPending(true);
    setMessage(null);
    const res = await fetch("/api/admin/flagging/run", { method: "POST" }).catch(
      () => null
    );
    setPending(false);
    if (res && res.ok) {
      const data = (await res.json().catch(() => null)) as { flagged?: number } | null;
      setMessage(t.flaggingDone(data?.flagged ?? 0));
      router.refresh();
    } else {
      setMessage(t.flaggingError);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <button
        onClick={run}
        disabled={pending}
        className="cursor-pointer rounded-full border border-ink-300 bg-surface px-3 py-1.5 text-xs font-semibold text-ink-800 transition hover:border-brand-400 hover:text-brand-700 disabled:opacity-60"
      >
        {pending ? t.runningFlagging : t.runFlagging}
      </button>
      {message && <p className="text-xs text-ink-500">{message}</p>}
    </div>
  );
}
