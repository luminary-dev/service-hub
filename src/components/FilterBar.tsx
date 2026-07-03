"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CATEGORIES, DISTRICTS } from "@/lib/constants";
import { categoryLabelLoc, districtLabelLoc } from "@/lib/i18n";
import { SORT_KEYS, type SortKey } from "@/lib/sort-keys";
import { useLocale, useT } from "./I18nProvider";

export default function FilterBar({
  q: initialQ,
  category: initialCategory,
  district: initialDistrict,
  sort: initialSort,
}: {
  q: string;
  category: string;
  district: string;
  sort: SortKey;
}) {
  const [q, setQ] = useState(initialQ);
  const [category, setCategory] = useState(initialCategory);
  const [district, setDistrict] = useState(initialDistrict);
  const [sort, setSort] = useState<SortKey>(initialSort);
  const router = useRouter();
  const locale = useLocale();
  const t = useT();

  function apply(next: {
    q?: string;
    category?: string;
    district?: string;
    sort?: SortKey;
  }) {
    const params = new URLSearchParams();
    const nq = next.q ?? q;
    const nc = next.category ?? category;
    const nd = next.district ?? district;
    const ns = next.sort ?? sort;
    if (nq.trim()) params.set("q", nq.trim());
    if (nc) params.set("category", nc);
    if (nd) params.set("district", nd);
    if (ns !== "recommended") params.set("sort", ns);
    router.push(`/providers?${params.toString()}`);
  }

  return (
    <div className="space-y-2">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          apply({});
        }}
        className="card flex flex-col gap-2 p-3 sm:flex-row sm:items-center"
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t.browse.searchPh}
          className="input sm:flex-1"
        />
        <select
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            apply({ category: e.target.value });
          }}
          aria-label={t.search.allCategories}
          className="input cursor-pointer sm:w-48"
        >
          <option value="">{t.search.allCategories}</option>
          {CATEGORIES.map((c) => (
            <option key={c.slug} value={c.slug}>
              {categoryLabelLoc(c.slug, locale)}
            </option>
          ))}
        </select>
        <select
          value={district}
          onChange={(e) => {
            setDistrict(e.target.value);
            apply({ district: e.target.value });
          }}
          aria-label={t.browse.allDistricts}
          className="input cursor-pointer sm:w-44"
        >
          <option value="">{t.browse.allDistricts}</option>
          {DISTRICTS.map((d) => (
            <option key={d} value={d}>
              {districtLabelLoc(d, locale)}
            </option>
          ))}
        </select>
        <button type="submit" className="btn-primary">
          {t.search.button}
        </button>
      </form>

      <div className="flex items-center justify-end gap-2">
        <label htmlFor="sort" className="text-sm text-ink-500">
          {t.browse.sortLabel}
        </label>
        <select
          id="sort"
          value={sort}
          onChange={(e) => {
            const next = e.target.value as SortKey;
            setSort(next);
            apply({ sort: next });
          }}
          className="input cursor-pointer !w-auto !py-2"
        >
          {SORT_KEYS.map((key) => (
            <option key={key} value={key}>
              {t.browse.sort[key]}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
