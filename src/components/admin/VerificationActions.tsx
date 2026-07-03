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
        className="cursor-pointer rounded-full border border-ink-300 bg-white px-4 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-60"
      >
        {t.reject}
      </button>
    </div>
  );
}
