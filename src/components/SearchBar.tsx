"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FaMagnifyingGlass } from "react-icons/fa6";
import { CATEGORIES } from "@/lib/constants";
import { categoryLabelLoc } from "@/lib/i18n";
import { useLocale, useT } from "./I18nProvider";

export default function SearchBar() {
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const router = useRouter();
  const locale = useLocale();
  const t = useT();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (category) params.set("category", category);
    router.push(`/providers?${params.toString()}`);
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-2 rounded-2xl border border-ink-300 bg-surface p-2 transition-[border-color] duration-200 ease-snap focus-within:border-brand-500 sm:flex-row sm:items-center"
    >
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t.search.placeholder}
        aria-label={t.search.placeholder}
        className="min-w-0 flex-1 rounded-xl px-4 py-2.5 text-sm text-ink-900 placeholder:text-ink-500 focus:outline-none"
      />
      <select
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        aria-label={t.search.allCategories}
        className="cursor-pointer rounded-xl bg-ink-100 px-3 py-2.5 text-sm text-ink-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
      >
        <option value="">{t.search.allCategories}</option>
        {CATEGORIES.map((c) => (
          <option key={c.slug} value={c.slug}>
            {categoryLabelLoc(c.slug, locale)}
          </option>
        ))}
      </select>
      <button type="submit" className="btn-primary">
        <FaMagnifyingGlass className="h-3.5 w-3.5" />
        {t.search.button}
      </button>
    </form>
  );
}
