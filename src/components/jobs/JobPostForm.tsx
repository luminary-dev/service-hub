"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CATEGORIES, DISTRICTS } from "@/lib/constants";
import { categoryLabelLoc, districtLabelLoc } from "@/lib/i18n";
import { useLocale, useT } from "@/components/I18nProvider";

export default function JobPostForm() {
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
      router.push("/jobs");
      router.refresh();
    } else {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? t.postError);
    }
  }

  return (
    <form onSubmit={submit} className="card space-y-4 p-6">
      <div>
        <label className="label">{t.jobTitle}</label>
        <input
          className="input"
          value={form.title}
          onChange={(e) => set("title", e.target.value)}
          placeholder={t.jobTitlePh}
          required
          minLength={5}
          maxLength={100}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label">{t.category}</label>
          <select
            className="input"
            value={form.category}
            onChange={(e) => set("category", e.target.value)}
            required
          >
            <option value="">{t.selectCategory}</option>
            {CATEGORIES.map((c) => (
              <option key={c.slug} value={c.slug}>
                {categoryLabelLoc(c.slug, locale)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">{t.district}</label>
          <select
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
        </div>
      </div>
      <div>
        <label className="label">{t.description}</label>
        <textarea
          className="input min-h-32 resize-y"
          value={form.description}
          onChange={(e) => set("description", e.target.value)}
          placeholder={t.descriptionPh}
          required
          minLength={10}
          maxLength={2000}
        />
      </div>
      <div>
        <label className="label">{t.budget}</label>
        <input
          className="input"
          type="number"
          min={100}
          value={form.budget}
          onChange={(e) => set("budget", e.target.value)}
          placeholder={t.budgetPh}
        />
        <p className="mt-1 text-xs text-ink-500">{t.budgetOptional}</p>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="submit" disabled={loading} className="btn-primary">
        {loading ? t.posting : t.post}
      </button>
    </form>
  );
}
