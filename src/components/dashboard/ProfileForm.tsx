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
import { useLocale, useT } from "../I18nProvider";
import { useToast } from "../ToastProvider";
import type { DashboardData } from "./DashboardTabs";

// Away-until picker bounds (#49), fixed per page load (render must stay pure):
// today .. one year out, mirroring the server-side validation.
const AWAY_UNTIL_MIN = new Date().toISOString().slice(0, 10);
const AWAY_UNTIL_MAX = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
  .toISOString()
  .slice(0, 10);

export default function ProfileForm({
  data,
  categories = STATIC_CATEGORY_OPTIONS,
}: {
  data: DashboardData;
  categories?: CategoryOption[];
}) {
  const locale = useLocale();
  const tx = useT();
  const p = tx.dashboard.profile;
  const [form, setForm] = useState({
    name: data.name,
    phone: data.phone,
    category: data.category,
    headline: data.headline,
    bio: data.bio,
    district: data.district,
    city: data.city,
    experience: String(data.experience),
    available: data.available,
    // Away mode (#49): the date input works in local yyyy-mm-dd.
    awayUntil: data.awayUntil ? data.awayUntil.slice(0, 10) : "",
    whatsapp: data.whatsapp,
    phone2: data.phone2,
    facebook: data.facebook,
    instagram: data.instagram,
    tiktok: data.tiktok,
    youtube: data.youtube,
    website: data.website,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const toast = useToast();
  const router = useRouter();

  function set(field: string, value: string | boolean) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/provider/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        experience: Number(form.experience) || 0,
        // Empty input means "not away" — send an explicit null to clear it.
        awayUntil: form.awayUntil || null,
      }),
    });
    setLoading(false);
    if (res.ok) {
      toast.success(p.saved);
      router.refresh();
    } else {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? p.saveError);
    }
  }

  return (
    <form onSubmit={submit} className="card space-y-6 p-6">
      <label className="flex cursor-pointer items-center justify-between rounded-xl bg-ink-50 px-4 py-3">
        <span>
          <span className="block text-sm font-medium text-ink-800">
            {p.availableTitle}
          </span>
          <span className="block text-xs text-ink-500">
            {p.availableHint}
          </span>
        </span>
        <input
          type="checkbox"
          checked={form.available}
          onChange={(e) => set("available", e.target.checked)}
          className="h-5 w-5 cursor-pointer accent-brand-700"
        />
      </label>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-ink-50 px-4 py-3">
        <span>
          <span className="block text-sm font-medium text-ink-800">
            {p.awayUntilTitle}
          </span>
          <span className="block text-xs text-ink-500">{p.awayUntilHint}</span>
        </span>
        <span className="flex items-center gap-2">
          <input
            type="date"
            value={form.awayUntil}
            min={AWAY_UNTIL_MIN}
            max={AWAY_UNTIL_MAX}
            onChange={(e) => set("awayUntil", e.target.value)}
            className="input w-auto"
            aria-label={p.awayUntilTitle}
          />
          {form.awayUntil && (
            <button
              type="button"
              onClick={() => set("awayUntil", "")}
              className="text-sm font-medium text-ink-500 hover:text-ink-800"
            >
              {p.awayUntilClear}
            </button>
          )}
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label">{p.fullName}</label>
          <input
            className="input"
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            required
            minLength={2}
          />
        </div>
        <div>
          <label className="label">{p.phone}</label>
          <input
            className="input"
            type="tel"
            value={form.phone}
            onChange={(e) => set("phone", e.target.value)}
            required
            minLength={9}
          />
        </div>
        <div>
          <label className="label">{p.category}</label>
          <select
            className="input"
            value={form.category}
            onChange={(e) => set("category", e.target.value)}
          >
            {/* Keep the saved category selectable even if it was deactivated
                (it then no longer appears in the fetched list). */}
            {categories.some((c) => c.slug === data.category) ? null : (
              <option value={data.category}>{data.category}</option>
            )}
            {categories.map((c) => (
              <option key={c.slug} value={c.slug}>
                {categoryOptionLabel(c, locale)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">{p.experience}</label>
          <input
            className="input"
            type="number"
            min={0}
            max={60}
            value={form.experience}
            onChange={(e) => set("experience", e.target.value)}
          />
        </div>
        <div>
          <label className="label">{p.district}</label>
          <select
            className="input"
            value={form.district}
            onChange={(e) => set("district", e.target.value)}
          >
            {DISTRICTS.map((d) => (
              <option key={d} value={d}>
                {districtLabelLoc(d, locale)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">{p.townCity}</label>
          <input
            className="input"
            value={form.city}
            onChange={(e) => set("city", e.target.value)}
            required
          />
        </div>
      </div>

      <div>
        <label className="label">{p.headline}</label>
        <input
          className="input"
          value={form.headline}
          onChange={(e) => set("headline", e.target.value)}
          required
          minLength={5}
          maxLength={120}
        />
      </div>
      <div>
        <label className="label">{p.about}</label>
        <textarea
          className="input min-h-32 resize-y"
          value={form.bio}
          onChange={(e) => set("bio", e.target.value)}
          required
          minLength={20}
        />
      </div>

      <div>
        <h3 className="text-sm font-semibold text-ink-900">
          {p.contactSocial}
        </h3>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">{p.whatsapp}</label>
            <input
              className="input"
              value={form.whatsapp}
              onChange={(e) => set("whatsapp", e.target.value)}
              placeholder="94771234567"
            />
          </div>
          <div>
            <label className="label">{p.altPhone}</label>
            <input
              className="input"
              value={form.phone2}
              onChange={(e) => set("phone2", e.target.value)}
            />
          </div>
          <div>
            <label className="label">{p.facebook}</label>
            <input
              className="input"
              value={form.facebook}
              onChange={(e) => set("facebook", e.target.value)}
            />
          </div>
          <div>
            <label className="label">{p.instagram}</label>
            <input
              className="input"
              value={form.instagram}
              onChange={(e) => set("instagram", e.target.value)}
            />
          </div>
          <div>
            <label className="label">{p.tiktok}</label>
            <input
              className="input"
              value={form.tiktok}
              onChange={(e) => set("tiktok", e.target.value)}
            />
          </div>
          <div>
            <label className="label">{p.youtube}</label>
            <input
              className="input"
              value={form.youtube}
              onChange={(e) => set("youtube", e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="label">{p.website}</label>
            <input
              className="input"
              value={form.website}
              onChange={(e) => set("website", e.target.value)}
            />
          </div>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button type="submit" disabled={loading} className="btn-primary">
        {loading ? p.saving : p.save}
      </button>
    </form>
  );
}
