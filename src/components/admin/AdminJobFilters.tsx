"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { CategoryOption } from "@/lib/categories";
import { categoryOptionLabel } from "@/lib/categories";
import { useLocale, useT } from "../I18nProvider";

// Job list filters (#222): status/category, shareable via the URL like the
// public browse filters (FilterBar). Selecting either navigates immediately.
export default function AdminJobFilters({
  status: initialStatus,
  category: initialCategory,
  categories,
}: {
  status: string;
  category: string;
  categories: CategoryOption[];
}) {
  const [status, setStatus] = useState(initialStatus);
  const [category, setCategory] = useState(initialCategory);
  const router = useRouter();
  const locale = useLocale();
  const t = useT().admin;

  function apply(next: { status?: string; category?: string }) {
    const nextStatus = next.status ?? status;
    const nextCategory = next.category ?? category;
    const params = new URLSearchParams();
    if (nextStatus) params.set("status", nextStatus);
    if (nextCategory) params.set("category", nextCategory);
    const qs = params.toString();
    router.push(`/admin/jobs${qs ? `?${qs}` : ""}`);
  }

  return (
    <div className="flex flex-wrap gap-2">
      <select
        value={status}
        onChange={(e) => {
          setStatus(e.target.value);
          apply({ status: e.target.value });
        }}
        aria-label={t.jobFilterStatus}
        className="input cursor-pointer sm:w-44"
      >
        <option value="">{t.jobStatusAll}</option>
        <option value="OPEN">{t.jobStatusOpen}</option>
        <option value="CLOSED">{t.jobStatusClosed}</option>
      </select>
      <select
        value={category}
        onChange={(e) => {
          setCategory(e.target.value);
          apply({ category: e.target.value });
        }}
        aria-label={t.jobFilterCategory}
        className="input cursor-pointer sm:w-48"
      >
        <option value="">{t.jobCategoryAll}</option>
        {categories.map((c) => (
          <option key={c.slug} value={c.slug}>
            {categoryOptionLabel(c, locale)}
          </option>
        ))}
      </select>
    </div>
  );
}
