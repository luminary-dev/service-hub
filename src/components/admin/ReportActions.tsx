"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "../I18nProvider";

// Close out an abuse report (#50): PATCH the owning service's admin endpoint
// (provider-service /api/admin/reports/:id or review-service
// /api/admin/review-reports/:id — the caller passes the full path).
export default function ReportActions({ endpoint }: { endpoint: string }) {
  const [pending, setPending] = useState(false);
  const t = useT().admin;
  const router = useRouter();

  async function act(status: "RESOLVED" | "DISMISSED") {
    setPending(true);
    const res = await fetch(endpoint, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    }).catch(() => null);
    setPending(false);
    if (res && res.ok) router.refresh();
  }

  return (
    <div className="flex flex-wrap gap-2">
      <button
        onClick={() => act("RESOLVED")}
        disabled={pending}
        className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-md border border-emerald-300 bg-surface px-3 py-1.5 font-display text-xs font-semibold text-emerald-700 transition-[border-color,background-color,transform] duration-200 ease-snap hover:border-emerald-400 hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:ring-offset-2 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {t.resolve}
      </button>
      <button
        onClick={() => act("DISMISSED")}
        disabled={pending}
        className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-md border border-ink-300 bg-surface px-3 py-1.5 font-display text-xs font-semibold text-ink-600 transition-[border-color,background-color,transform] duration-200 ease-snap hover:border-ink-400 hover:bg-ink-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-300 focus-visible:ring-offset-2 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {t.dismissReport}
      </button>
    </div>
  );
}
