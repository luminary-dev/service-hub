"use client";

import { useState } from "react";
import { FaPlus } from "@/components/icons";
import { useT } from "./I18nProvider";
import { useToast } from "./ToastProvider";

// Save-this-search affordance on /providers (#516). Rendered only for
// signed-in customers with at least one primary filter (q/category/district)
// active — the server page owns that gate. Expands into a one-field name form
// (prefilled with a label derived from the filters) and POSTs the filters to
// identity via the gateway. 429 = per-user cap reached.
export default function SaveSearchButton({
  query,
  category,
  district,
  defaultName,
}: {
  query?: string;
  category?: string;
  district?: string;
  defaultName: string;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(defaultName);
  const [pending, setPending] = useState(false);
  const t = useT();
  const toast = useToast();

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (pending || !name.trim()) return;
    setPending(true);
    const res = await fetch("/api/saved-searches", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        query: query ?? "",
        category: category ?? "",
        district: district ?? "",
      }),
    }).catch(() => null);
    setPending(false);

    if (!res || !res.ok) {
      toast.error(
        res?.status === 429 ? t.toast.searchLimit : t.toast.searchSaveError
      );
      return;
    }
    setOpen(false);
    toast.success(t.toast.searchSaved);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={false}
        className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-brand-600 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
      >
        <FaPlus className="h-3.5 w-3.5" />
        {t.browse.saveSearch}
      </button>
    );
  }

  return (
    <form onSubmit={save} className="flex flex-wrap items-center gap-2">
      <label htmlFor="save-search-name" className="sr-only">
        {t.browse.saveSearchNameLabel}
      </label>
      <input
        id="save-search-name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={60}
        required
        // Focus moves into the just-revealed form the user explicitly opened.
        autoFocus
        className="input h-9 w-56 text-sm"
      />
      <button type="submit" className="btn-primary !px-4 !py-1.5 text-sm" disabled={pending}>
        {pending ? t.browse.saveSearchSaving : t.browse.saveSearchSave}
      </button>
      <span className="text-xs text-ink-500">{t.browse.saveSearchHint}</span>
    </form>
  );
}
