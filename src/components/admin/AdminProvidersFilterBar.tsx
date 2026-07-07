"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { categoryOptionLabel } from "@/lib/categories";
import type { AdminSortKey, VerificationStatusFilter } from "@/lib/admin-list";
import type { AdminCategory } from "./AdminCategoryManager";
import { useLocale, useT } from "../I18nProvider";

// Search, filter (category/city/status/suspended) and sort controls for the
// admin providers moderation list (#224). Every change re-navigates to
// /admin/providers with the new query string — the page itself stays a
// server component that reads `searchParams` and re-fetches. Filter changes
// (everything except paging) reset back to page 1.
export default function AdminProvidersFilterBar({
  q: initialQ,
  category: initialCategory,
  city: initialCity,
  status: initialStatus,
  suspended: initialSuspended,
  sort: initialSort,
  categories,
}: {
  q: string;
  category: string;
  city: string;
  status: VerificationStatusFilter | "";
  suspended: "true" | "false" | "";
  sort: AdminSortKey;
  categories: AdminCategory[];
}) {
  const [q, setQ] = useState(initialQ);
  const [city, setCity] = useState(initialCity);
  const router = useRouter();
  const locale = useLocale();
  const full = useT();
  const t = full.admin;

  function apply(next: {
    q?: string;
    category?: string;
    city?: string;
    status?: string;
    suspended?: string;
    sort?: string;
  }) {
    const params = new URLSearchParams();
    const nq = next.q ?? q;
    const ncategory = next.category ?? initialCategory;
    const ncity = next.city ?? city;
    const nstatus = next.status ?? initialStatus;
    const nsuspended = next.suspended ?? initialSuspended;
    const nsort = next.sort ?? initialSort;
    if (nq.trim()) params.set("q", nq.trim());
    if (ncategory) params.set("category", ncategory);
    if (ncity.trim()) params.set("city", ncity.trim());
    if (nstatus) params.set("status", nstatus);
    if (nsuspended) params.set("suspended", nsuspended);
    if (nsort !== "newest") params.set("sort", nsort);
    router.push(`/admin/providers${params.toString() ? `?${params}` : ""}`);
  }

  const hasFilters =
    !!initialQ || !!initialCategory || !!initialCity || !!initialStatus || !!initialSuspended;

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
            placeholder={t.adminSearchPh}
            aria-label={t.adminSearchPh}
            className="input sm:flex-1"
          />
          <input
            type="search"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder={t.adminFilterCityPh}
            aria-label={t.adminFilterCityPh}
            className="input sm:w-48"
          />
          <select
            value={initialCategory}
            onChange={(e) => apply({ category: e.target.value })}
            aria-label={t.providersTitle}
            className="input cursor-pointer sm:w-48"
          >
            <option value="">{full.search.allCategories}</option>
            {categories.map((c) => (
              <option key={c.slug} value={c.slug}>
                {categoryOptionLabel(c, locale)}
              </option>
            ))}
          </select>
          <button type="submit" className="btn-primary">
            {full.search.button}
          </button>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <select
            value={initialStatus}
            onChange={(e) => apply({ status: e.target.value })}
            aria-label={t.adminFilterStatusAll}
            className="input cursor-pointer sm:w-44"
          >
            <option value="">{t.adminFilterStatusAll}</option>
            <option value="VERIFIED">{t.adminStatusVerified}</option>
            <option value="PENDING">{t.adminStatusPending}</option>
            <option value="REJECTED">{t.adminStatusRejected}</option>
            <option value="NONE">{t.adminStatusNone}</option>
          </select>
          <select
            value={initialSuspended}
            onChange={(e) => apply({ suspended: e.target.value })}
            aria-label={t.adminFilterSuspendedAll}
            className="input cursor-pointer sm:w-44"
          >
            <option value="">{t.adminFilterSuspendedAll}</option>
            <option value="false">{t.adminFilterActiveOnly}</option>
            <option value="true">{t.adminFilterSuspendedOnly}</option>
          </select>
          {hasFilters && (
            <button
              type="button"
              onClick={() => router.push("/admin/providers")}
              className="btn-secondary sm:ml-auto"
            >
              {t.adminClearFilters}
            </button>
          )}
        </div>
      </form>

      <div className="flex items-center justify-end gap-2">
        <label htmlFor="admin-sort" className="text-sm text-ink-500">
          {t.adminSortLabel}
        </label>
        <select
          id="admin-sort"
          value={initialSort}
          onChange={(e) => apply({ sort: e.target.value })}
          className="input cursor-pointer !w-auto !py-2"
        >
          <option value="newest">{t.adminSortNewest}</option>
          <option value="mostReviews">{t.adminSortMostReviews}</option>
        </select>
      </div>
    </div>
  );
}
