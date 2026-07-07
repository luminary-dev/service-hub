"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "../I18nProvider";

// Billing v1 (#221): mark a commission transaction paid or refunded. Mirrors
// the fetch-PATCH-then-refresh pattern used by the other admin action
// components (ReportActions, AdminProviderActions, VerificationActions).
export default function TransactionActions({
  transactionId,
  status,
}: {
  transactionId: string;
  status: "PENDING" | "PAID" | "REFUNDED";
}) {
  const [pending, setPending] = useState(false);
  const t = useT().admin;
  const router = useRouter();

  async function act(next: "PAID" | "REFUNDED") {
    setPending(true);
    const res = await fetch(`/api/admin/transactions/${transactionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    }).catch(() => null);
    setPending(false);
    if (res && res.ok) router.refresh();
  }

  return (
    <div className="flex flex-wrap gap-2">
      {status !== "PAID" && (
        <button
          onClick={() => act("PAID")}
          disabled={pending}
          className="cursor-pointer rounded-full border border-emerald-300 bg-surface px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50 dark:hover:bg-emerald-950 disabled:opacity-60"
        >
          {t.markPaid}
        </button>
      )}
      {status !== "REFUNDED" && (
        <button
          onClick={() => act("REFUNDED")}
          disabled={pending}
          className="cursor-pointer rounded-full border border-ink-300 bg-surface px-3 py-1.5 text-xs font-semibold text-ink-600 transition hover:border-ink-400 disabled:opacity-60"
        >
          {t.markRefunded}
        </button>
      )}
    </div>
  );
}
