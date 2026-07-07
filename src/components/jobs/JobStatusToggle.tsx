"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useT } from "@/components/I18nProvider";

export default function JobStatusToggle({
  jobId,
  status,
}: {
  jobId: string;
  status: string;
}) {
  const [pending, setPending] = useState(false);
  const router = useRouter();
  const t = useT().jobs;

  async function toggle() {
    setPending(true);
    const next = status === "OPEN" ? "CLOSED" : "OPEN";
    const res = await fetch(`/api/jobs/${jobId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    }).catch(() => null);
    setPending(false);
    if (res && res.ok) router.refresh();
  }

  return (
    <button
      onClick={toggle}
      disabled={pending}
      className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-ink-300 px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-600 transition-[border-color,color] duration-200 ease-snap hover:border-brand-400 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-300 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {status === "OPEN" ? t.close : t.reopen}
    </button>
  );
}
