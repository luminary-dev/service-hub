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
import { Field, FormRow } from "@/components/ui/Field";
import ServiceDistrictsPicker from "@/components/ServiceDistrictsPicker";
import { useLocale, useT } from "../I18nProvider";
import { useToast } from "../ToastProvider";
import type { DashboardData } from "./DashboardTabs";

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
  // Away-until picker bounds (#49): today .. one year out, mirroring the
  // server-side validation. A useState lazy initializer computes them once at
  // render time — per request on the server (so they can't freeze at process
  // start and drift days into the past, #365) and once on the client — while
  // keeping the render body itself pure.
  const [awayBounds] = useState(() => ({
    min: new Date().toISOString().slice(0, 10),
    max: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10),
  }));
  const [form, setForm] = useState({
    name: data.name,
    phone: data.phone,
    category: data.category,
    headline: data.headline,
    bio: data.bio,
    // Optional Sinhala variants (#515); default to "" for the controlled input.
    headlineSi: data.headlineSi ?? "",
    bioSi: data.bioSi ?? "",
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
  // Extra served districts beyond the home district (#502) — the home
  // district is pinned by the picker and unioned in at save time.
  const [serviceDistricts, setServiceDistricts] = useState<string[]>(
    data.serviceDistricts.filter((d) => d !== data.district),
  );
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
    try {
      const res = await fetch("/api/provider/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          // Full served set (#502): home district first, extras after.
          serviceDistricts: [
            form.district,
            ...serviceDistricts.filter((d) => d !== form.district),
          ],
          experience: Number(form.experience) || 0,
          // Empty input means "not away" — send an explicit null to clear it.
          awayUntil: form.awayUntil || null,
        }),
      });
      if (res.ok) {
        toast.success(p.saved);
        router.refresh();
      } else {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? p.saveError);
      }
    } catch {
      // Network failure — recover instead of wedging the button (#363).
      setError(p.saveError);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="card space-y-6 p-6">
      <label className="flex cursor-pointer items-center justify-between rounded-lg border border-ink-200 bg-ink-50 px-4 py-3">
        <span>
          <span className="block text-sm font-medium text-ink-800">
            {p.availableTitle}
          </span>
          <span className="block text-xs text-ink-500">{p.availableHint}</span>
        </span>
        <input
          type="checkbox"
          checked={form.available}
          onChange={(e) => set("available", e.target.checked)}
          className="h-5 w-5 cursor-pointer accent-brand-700"
        />
      </label>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-ink-200 bg-ink-50 px-4 py-3">
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
            min={awayBounds.min}
            max={awayBounds.max}
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

      <FormRow>
        <Field label={p.fullName} htmlFor="pf-fullName">
          <input
            id="pf-fullName"
            className="input"
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            required
            minLength={2}
          />
        </Field>
        <Field label={p.phone} htmlFor="pf-phone">
          <input
            id="pf-phone"
            className="input"
            type="tel"
            value={form.phone}
            onChange={(e) => set("phone", e.target.value)}
            required
            minLength={9}
          />
        </Field>
        <Field label={p.category} htmlFor="pf-category">
          <select
            id="pf-category"
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
        </Field>
        <Field label={p.experience} htmlFor="pf-experience">
          <input
            id="pf-experience"
            className="input"
            type="number"
            min={0}
            max={60}
            value={form.experience}
            onChange={(e) => set("experience", e.target.value)}
          />
        </Field>
        <Field label={p.district} htmlFor="pf-district">
          <select
            id="pf-district"
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
        </Field>
        <Field label={p.townCity} htmlFor="pf-townCity">
          <input
            id="pf-townCity"
            className="input"
            value={form.city}
            onChange={(e) => set("city", e.target.value)}
            required
          />
        </Field>
      </FormRow>

      {/* Multi-district service area (#502). */}
      <ServiceDistrictsPicker
        id="pf-service-districts"
        primary={form.district}
        value={serviceDistricts}
        onChange={setServiceDistricts}
      />

      <Field label={p.headline} htmlFor="pf-headline">
        <input
          id="pf-headline"
          className="input"
          value={form.headline}
          onChange={(e) => set("headline", e.target.value)}
          required
          minLength={5}
          maxLength={120}
        />
      </Field>
      <Field label={p.about} htmlFor="pf-about">
        <textarea
          id="pf-about"
          className="input min-h-32 resize-y"
          value={form.bio}
          onChange={(e) => set("bio", e.target.value)}
          required
          minLength={20}
        />
      </Field>

      {/* Optional Sinhala variants (#515): shown to visitors browsing in
          Sinhala; the English fields above stay the required source of truth. */}
      <Field label={p.headlineSi} htmlFor="pf-headline-si" help={p.sinhalaHint}>
        <input
          id="pf-headline-si"
          className="input"
          value={form.headlineSi}
          onChange={(e) => set("headlineSi", e.target.value)}
          maxLength={120}
          lang="si"
        />
      </Field>
      <Field label={p.aboutSi} htmlFor="pf-about-si" help={p.sinhalaHint}>
        <textarea
          id="pf-about-si"
          className="input min-h-32 resize-y"
          value={form.bioSi}
          onChange={(e) => set("bioSi", e.target.value)}
          maxLength={2000}
          lang="si"
        />
      </Field>

      <div>
        <div className="flex items-center gap-3">
          <h3 className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-500">
            {p.contactSocial}
          </h3>
          <span className="h-px flex-1 border-t border-dashed border-ink-200" />
        </div>
        <FormRow className="mt-4">
          <Field label={p.whatsapp} htmlFor="pf-whatsapp">
            <input
              id="pf-whatsapp"
              className="input"
              value={form.whatsapp}
              onChange={(e) => set("whatsapp", e.target.value)}
              placeholder="94771234567"
            />
          </Field>
          <Field label={p.altPhone} htmlFor="pf-altPhone">
            <input
              id="pf-altPhone"
              className="input"
              value={form.phone2}
              onChange={(e) => set("phone2", e.target.value)}
            />
          </Field>
          <Field label={p.facebook} htmlFor="pf-facebook">
            <input
              id="pf-facebook"
              className="input"
              value={form.facebook}
              onChange={(e) => set("facebook", e.target.value)}
            />
          </Field>
          <Field label={p.instagram} htmlFor="pf-instagram">
            <input
              id="pf-instagram"
              className="input"
              value={form.instagram}
              onChange={(e) => set("instagram", e.target.value)}
            />
          </Field>
          <Field label={p.tiktok} htmlFor="pf-tiktok">
            <input
              id="pf-tiktok"
              className="input"
              value={form.tiktok}
              onChange={(e) => set("tiktok", e.target.value)}
            />
          </Field>
          <Field label={p.youtube} htmlFor="pf-youtube">
            <input
              id="pf-youtube"
              className="input"
              value={form.youtube}
              onChange={(e) => set("youtube", e.target.value)}
            />
          </Field>
          <Field label={p.website} htmlFor="pf-website" className="sm:col-span-2">
            <input
              id="pf-website"
              className="input"
              value={form.website}
              onChange={(e) => set("website", e.target.value)}
            />
          </Field>
        </FormRow>
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      <button type="submit" disabled={loading} className="btn-primary">
        {loading ? p.saving : p.save}
      </button>
    </form>
  );
}
