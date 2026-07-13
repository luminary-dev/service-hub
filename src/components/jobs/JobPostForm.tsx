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
import {
  FormError,
  useFieldErrors,
  type FieldErrors,
} from "@/components/ui/FormError";

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
  const { fieldErrors, show } = useFieldErrors();
  const router = useRouter();
  const locale = useLocale();
  const t = useT().jobs;

  function set(k: string, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function validate(): FieldErrors {
    const errs: FieldErrors = {};
    if (form.title.trim().length < 5) errs["job-title"] = t.errTitle;
    if (!form.category) errs["job-category"] = t.errCategory;
    if (!form.district) errs["job-district"] = t.errDistrict;
    if (form.description.trim().length < 10)
      errs["job-description"] = t.errDescription;
    if (form.budget !== "" && !(Number(form.budget) >= 100))
      errs["job-budget"] = t.errBudget;
    return errs;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (show(validate())) return;
    setLoading(true);
    try {
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
      if (res.ok) {
        router.push(localizedHref("/jobs", locale));
        router.refresh();
      } else {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? t.postError);
      }
    } catch {
      // Network failure — recover instead of wedging the button (#363).
      setError(t.postError);
    } finally {
      setLoading(false);
    }
  }

  return (
    // noValidate: validation happens in JS so errors are localized, inline
    // and linked to their fields (#378), not browser bubbles.
    <form
      onSubmit={submit}
      noValidate
      className="tech-corners overflow-hidden rounded-lg border border-ink-300 bg-surface"
    >
      {/* Spec header bar — mirrors the register/provider form panel. */}
      <div className="flex items-center justify-between border-b border-ink-200 bg-ink-100 px-5 py-3 font-mono text-[11px] uppercase tracking-[0.12em]">
        <span className="font-bold tabular-nums text-ink-700">JOB-01</span>
        <span className="text-brand-700">{t.postTitle}</span>
      </div>
      <div className="space-y-4 p-6">
        <Field
          label={t.jobTitle}
          htmlFor="job-title"
          error={fieldErrors["job-title"]}
        >
          <input
            id="job-title"
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
          <Field
            label={t.category}
            htmlFor="job-category"
            error={fieldErrors["job-category"]}
          >
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
          <Field
            label={t.district}
            htmlFor="job-district"
            error={fieldErrors["job-district"]}
          >
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
        <Field
          label={t.description}
          htmlFor="job-description"
          error={fieldErrors["job-description"]}
        >
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
        <Field
          label={t.budget}
          htmlFor="job-budget"
          help={t.budgetOptional}
          error={fieldErrors["job-budget"]}
        >
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
        <FormError>{error}</FormError>
        <button type="submit" disabled={loading} className="btn-primary">
          {loading ? t.posting : t.post}
        </button>
      </div>
    </form>
  );
}
