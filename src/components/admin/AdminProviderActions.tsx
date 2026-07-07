"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "../I18nProvider";

export default function AdminProviderActions({
  providerId,
  verified,
  suspended,
}: {
  providerId: string;
  verified: boolean;
  suspended: boolean;
}) {
  const [pending, setPending] = useState(false);
  const t = useT().admin;
  const router = useRouter();

  async function act(action: string) {
    setPending(true);
    const res = await fetch(`/api/admin/providers/${providerId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    }).catch(() => null);
    setPending(false);
    if (res && res.ok) router.refresh();
  }

  return (
    <div className="flex flex-wrap gap-2">
      <button
        onClick={() => act(verified ? "unverify" : "verify")}
        disabled={pending}
        className="cursor-pointer rounded-sm border border-ink-300 bg-surface px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-ink-800 transition-[border-color,color,background-color] duration-200 ease-snap hover:border-brand-400 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {verified ? t.unverify : t.verify}
      </button>
      <button
        onClick={() => act(suspended ? "unsuspend" : "suspend")}
        disabled={pending}
        className={`cursor-pointer rounded-sm border px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-wider transition-[border-color,color,background-color] duration-200 ease-snap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60 ${
          suspended
            ? "border-emerald-300 bg-surface text-emerald-700 hover:bg-emerald-50 focus-visible:ring-emerald-400"
            : "border-red-300 bg-surface text-red-600 hover:bg-red-50 focus-visible:ring-red-400"
        }`}
      >
        {suspended ? t.unsuspend : t.suspend}
      </button>
    </div>
  );
}
