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
      className="text-sm font-medium text-ink-500 hover:text-ink-800 disabled:opacity-60"
    >
      {status === "OPEN" ? t.close : t.reopen}
    </button>
  );
}
