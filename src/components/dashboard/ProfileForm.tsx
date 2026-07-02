"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CATEGORIES, DISTRICTS } from "@/lib/constants";
import { categoryLabelLoc, districtLabelLoc } from "@/lib/i18n";
import { useLocale, useT } from "../I18nProvider";
import type { DashboardData } from "./DashboardTabs";

export default function ProfileForm({ data }: { data: DashboardData }) {
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
    whatsapp: data.whatsapp,
    phone2: data.phone2,
    facebook: data.facebook,
    instagram: data.instagram,
    tiktok: data.tiktok,
    youtube: data.youtube,
    website: data.website,
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null
  );
  const router = useRouter();

  function set(field: string, value: string | boolean) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    const res = await fetch("/api/provider/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        experience: Number(form.experience) || 0,
      }),
    });
    setLoading(false);
    if (res.ok) {
      setMessage({ ok: true, text: p.saved });
      router.refresh();
    } else {
      const d = await res.json().catch(() => ({}));
      setMessage({ ok: false, text: d.error ?? p.saveError });
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
            {CATEGORIES.map((c) => (
              <option key={c.slug} value={c.slug}>
                {categoryLabelLoc(c.slug, locale)}
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

      {message && (
        <p
          className={`text-sm ${message.ok ? "text-brand-700" : "text-red-600"}`}
        >
          {message.text}
        </p>
      )}

      <button type="submit" disabled={loading} className="btn-primary">
        {loading ? p.saving : p.save}
      </button>
    </form>
  );
}
