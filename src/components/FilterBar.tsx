"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { DISTRICTS } from "@/lib/constants";
import {
  categoryOptionLabel,
  STATIC_CATEGORY_OPTIONS,
  type CategoryOption,
} from "@/lib/categories";
import { districtLabelLoc } from "@/lib/i18n";
import { localizedHref } from "@/lib/links";
import { SORT_KEYS, type SortKey } from "@/lib/sort-keys";
import { useLocale, useT } from "./I18nProvider";

// Minimum-rating choices shown in the select ("4★ & up" …).
const RATING_MIN_OPTIONS = [4, 3, 2] as const;

export default function FilterBar({
  q: initialQ,
  category: initialCategory,
  district: initialDistrict,
  sort: initialSort,
  priceMin: initialPriceMin = "",
  priceMax: initialPriceMax = "",
  ratingMin: initialRatingMin = "",
  availableOnly: initialAvailableOnly = false,
  categories = STATIC_CATEGORY_OPTIONS,
}: {
  q: string;
  category: string;
  district: string;
  sort: SortKey;
  priceMin?: string;
  priceMax?: string;
  ratingMin?: string;
  availableOnly?: boolean;
  categories?: CategoryOption[];
}) {
  const [q, setQ] = useState(initialQ);
  const [category, setCategory] = useState(initialCategory);
  const [district, setDistrict] = useState(initialDistrict);
  const [sort, setSort] = useState<SortKey>(initialSort);
  const [priceMin, setPriceMin] = useState(initialPriceMin);
  const [priceMax, setPriceMax] = useState(initialPriceMax);
  const [ratingMin, setRatingMin] = useState(initialRatingMin);
  const [availableOnly, setAvailableOnly] = useState(initialAvailableOnly);
  const router = useRouter();
  const locale = useLocale();
  const t = useT();

  function apply(next: {
    q?: string;
    category?: string;
    district?: string;
    sort?: SortKey;
    ratingMin?: string;
    availableOnly?: boolean;
  }) {
    const params = new URLSearchParams();
    const nq = next.q ?? q;
    const nc = next.category ?? category;
    const nd = next.district ?? district;
    const ns = next.sort ?? sort;
    const nr = next.ratingMin ?? ratingMin;
    const na = next.availableOnly ?? availableOnly;
    if (nq.trim()) params.set("q", nq.trim());
    if (nc) params.set("category", nc);
    if (nd) params.set("district", nd);
    if (priceMin.trim()) params.set("priceMin", priceMin.trim());
    if (priceMax.trim()) params.set("priceMax", priceMax.trim());
    if (nr) params.set("ratingMin", nr);
    if (na) params.set("availableOnly", "1");
    if (ns !== "recommended") params.set("sort", ns);
    router.push(localizedHref(`/providers?${params.toString()}`, locale));
  }

  return (
    <div className="space-y-2">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          apply({});
        }}
        className="card flex flex-col gap-2 p-3"
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t.browse.searchPh}
            aria-label={t.browse.searchPh}
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
            {categories.map((c) => (
              <option key={c.slug} value={c.slug}>
                {categoryOptionLabel(c, locale)}
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
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            value={priceMin}
            onChange={(e) => setPriceMin(e.target.value)}
            inputMode="numeric"
            type="number"
            min={0}
            placeholder={t.browse.priceMinPh}
            aria-label={t.browse.priceMinLabel}
            className="input sm:w-40"
          />
          <input
            value={priceMax}
            onChange={(e) => setPriceMax(e.target.value)}
            inputMode="numeric"
            type="number"
            min={0}
            placeholder={t.browse.priceMaxPh}
            aria-label={t.browse.priceMaxLabel}
            className="input sm:w-40"
          />
          <select
            value={ratingMin}
            onChange={(e) => {
              setRatingMin(e.target.value);
              apply({ ratingMin: e.target.value });
            }}
            aria-label={t.browse.ratingLabel}
            className="input cursor-pointer sm:w-40"
          >
            <option value="">{t.browse.anyRating}</option>
            {RATING_MIN_OPTIONS.map((n) => (
              <option key={n} value={String(n)}>
                {t.browse.ratingUp(n)}
              </option>
            ))}
          </select>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-700 sm:ml-1">
            <input
              type="checkbox"
              checked={availableOnly}
              onChange={(e) => {
                setAvailableOnly(e.target.checked);
                apply({ availableOnly: e.target.checked });
              }}
              className="h-4 w-4 cursor-pointer accent-brand-700"
            />
            {t.browse.availableOnly}
          </label>
        </div>
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
