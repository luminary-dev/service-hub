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
        className="cursor-pointer rounded-full border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-60"
      >
        {t.resolve}
      </button>
      <button
        onClick={() => act("DISMISSED")}
        disabled={pending}
        className="cursor-pointer rounded-full border border-ink-300 bg-white px-3 py-1.5 text-xs font-semibold text-ink-600 transition hover:border-ink-400 disabled:opacity-60"
      >
        {t.dismissReport}
      </button>
    </div>
  );
}
