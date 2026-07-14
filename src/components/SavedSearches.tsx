"use client";

import { useState } from "react";
import Link from "next/link";
import { FaTrash } from "@/components/icons";
import { useT } from "./I18nProvider";
import { useToast } from "./ToastProvider";

export type SavedSearchItem = {
  id: string;
  name: string;
  // Pre-localized on the server: the /providers URL that re-runs the search
  // and a human summary of its filters.
  href: string;
  filters: string;
};

// The /account saved-searches list (#516): re-run link + optimistic delete.
export default function SavedSearches({ initial }: { initial: SavedSearchItem[] }) {
  const [items, setItems] = useState(initial);
  const t = useT();
  const toast = useToast();

  async function remove(item: SavedSearchItem) {
    setItems((prev) => prev.filter((s) => s.id !== item.id)); // optimistic
    const res = await fetch(`/api/saved-searches/${item.id}`, {
      method: "DELETE",
    }).catch(() => null);
    if (!res || !res.ok) {
      setItems((prev) => [item, ...prev]); // revert on failure
      toast.error(t.toast.searchRemoveError);
      return;
    }
    toast.success(t.toast.searchRemoved);
  }

  if (items.length === 0) {
    return <p className="mt-6 text-sm text-ink-500">{t.account.searchesEmpty}</p>;
  }

  return (
    <>
      <p className="mt-2 text-sm text-ink-500">{t.account.searchesHint}</p>
      <ul className="mt-4 space-y-3">
        {items.map((s) => (
          <li
            key={s.id}
            className="tech-corners card flex flex-wrap items-center justify-between gap-3 p-4"
          >
            <div className="min-w-0">
              <p className="truncate font-semibold text-ink-900">{s.name}</p>
              <p className="mt-0.5 truncate font-mono text-xs text-ink-500">
                {s.filters}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Link
                href={s.href}
                className="text-sm font-medium text-brand-600 hover:text-brand-700"
              >
                {t.account.searchesView}
              </Link>
              <button
                type="button"
                onClick={() => remove(s)}
                aria-label={`${t.account.searchesDelete}: ${s.name}`}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-ink-300 bg-surface px-3 py-1.5 text-xs font-semibold text-ink-700 transition-[border-color,color] duration-200 ease-snap hover:border-brand-400 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
              >
                <FaTrash className="h-3 w-3" />
                {t.account.searchesDelete}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
