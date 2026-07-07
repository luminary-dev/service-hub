"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "../I18nProvider";

export default function VerificationActions({
  providerId,
}: {
  providerId: string;
}) {
  const [pending, setPending] = useState(false);
  const t = useT().admin;
  const router = useRouter();

  async function act(action: "approve" | "reject") {
    setPending(true);
    const res = await fetch(`/api/admin/verifications/${providerId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    }).catch(() => null);
    setPending(false);
    if (res && res.ok) router.refresh();
  }

  return (
    <div className="flex gap-2">
      <button
        onClick={() => act("approve")}
        disabled={pending}
        className="btn-primary !px-4 !py-2"
      >
        {t.approve}
      </button>
      <button
        onClick={() => act("reject")}
        disabled={pending}
        className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-md border border-red-300 bg-surface px-4 py-2 font-display text-sm font-semibold text-red-600 transition-[border-color,background-color,transform] duration-200 ease-snap hover:border-red-400 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300 focus-visible:ring-offset-2 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {t.reject}
      </button>
    </div>
  );
}
