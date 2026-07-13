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
import { useLocale, useT } from "@/components/I18nProvider";
import { Field, FormRow } from "@/components/ui/Field";

export default function JobPostForm({
  categories = STATIC_CATEGORY_OPTIONS,
}: {
  categories?: CategoryOption[];
}) {
  const [form, setForm] = useState({
    category: "",
    district: "",
    title: "",
    description: "",
    budget: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const locale = useLocale();
  const t = useT().jobs;

  function set(k: string, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category: form.category,
        district: form.district,
        title: form.title.trim(),
        description: form.description.trim(),
        budget: form.budget ? Number(form.budget) : null,
      }),
    });
    setLoading(false);
    if (res.ok) {
      router.push(localizedHref("/jobs", locale));
      router.refresh();
    } else {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? t.postError);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="tech-corners overflow-hidden rounded-lg border border-ink-300 bg-surface"
    >
      {/* Spec header bar — mirrors the register/provider form panel. */}
      <div className="flex items-center justify-between border-b border-ink-200 bg-ink-100 px-5 py-3 font-mono text-[11px] uppercase tracking-[0.12em]">
        <span className="font-bold tabular-nums text-ink-700">JOB-01</span>
        <span className="text-brand-700">{t.postTitle}</span>
      </div>
      <div className="space-y-4 p-6">
        <Field label={t.jobTitle} htmlFor="job-jobTitle">
          <input
            id="job-jobTitle"
            className="input"
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
            placeholder={t.jobTitlePh}
            required
            minLength={5}
            maxLength={100}
          />
        </Field>
        <FormRow>
          <Field label={t.category} htmlFor="job-category">
            <select
              id="job-category"
              className="input"
              value={form.category}
              onChange={(e) => set("category", e.target.value)}
              required
            >
              <option value="">{t.selectCategory}</option>
              {categories.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {categoryOptionLabel(c, locale)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t.district} htmlFor="job-district">
            <select
              id="job-district"
              className="input"
              value={form.district}
              onChange={(e) => set("district", e.target.value)}
              required
            >
              <option value="">{t.selectDistrict}</option>
              {DISTRICTS.map((d) => (
                <option key={d} value={d}>
                  {districtLabelLoc(d, locale)}
                </option>
              ))}
            </select>
          </Field>
        </FormRow>
        <Field label={t.description} htmlFor="job-description">
          <textarea
            id="job-description"
            className="input min-h-32 resize-y"
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            placeholder={t.descriptionPh}
            required
            minLength={10}
            maxLength={2000}
          />
        </Field>
        <Field label={t.budget} htmlFor="job-budget" help={t.budgetOptional}>
          <input
            id="job-budget"
            className="input"
            type="number"
            min={100}
            value={form.budget}
            onChange={(e) => set("budget", e.target.value)}
            placeholder={t.budgetPh}
          />
        </Field>
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
        <button type="submit" disabled={loading} className="btn-primary">
          {loading ? t.posting : t.post}
        </button>
      </div>
    </form>
  );
}
