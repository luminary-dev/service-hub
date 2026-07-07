"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FaTrash } from "@/components/icons";
import { useT } from "../I18nProvider";

export default function AdminDeleteButton({
  endpoint,
}: {
  endpoint: string;
}) {
  const [pending, setPending] = useState(false);
  const t = useT().admin;
  const router = useRouter();

  async function remove() {
    setPending(true);
    const res = await fetch(endpoint, { method: "DELETE" }).catch(() => null);
    setPending(false);
    if (res && res.ok) router.refresh();
  }

  return (
    <button
      onClick={remove}
      disabled={pending}
      aria-label={t.delete}
      className="inline-flex cursor-pointer items-center gap-1.5 rounded-sm border border-red-200 bg-surface px-2.5 py-1 font-mono text-[11px] font-semibold uppercase tracking-wider text-red-600 transition-[border-color,color,background-color] duration-200 ease-snap hover:border-red-300 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60"
    >
      <FaTrash className="h-3 w-3" />
      {t.delete}
    </button>
  );
}
