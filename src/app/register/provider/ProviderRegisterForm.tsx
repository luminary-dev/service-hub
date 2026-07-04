"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { DISTRICTS, PRICE_TYPES } from "@/lib/constants";
import { categoryOptionLabel, type CategoryOption } from "@/lib/categories";
import { districtLabelLoc, priceTypeLabelLoc } from "@/lib/i18n";
import { useLocale, useT } from "@/components/I18nProvider";
import CategoryIcon from "@/components/CategoryIcon";

type ServiceInput = {
  title: string;
  description: string;
  price: string;
  priceType: string;
};

const emptyService: ServiceInput = {
  title: "",
  description: "",
  price: "",
  priceType: "FIXED",
};

export default function ProviderRegisterForm({
  categories,
}: {
  categories: CategoryOption[];
}) {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const locale = useLocale();
  const r = useT().providerReg;
  const STEPS = r.steps;

  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    category: "",
    headline: "",
    bio: "",
    district: "",
    city: "",
    experience: "0",
    whatsapp: "",
    phone2: "",
    facebook: "",
    instagram: "",
    tiktok: "",
    youtube: "",
    website: "",
  });
  const [services, setServices] = useState<ServiceInput[]>([
    { ...emptyService },
  ]);

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function setService(i: number, field: keyof ServiceInput, value: string) {
    setServices((list) =>
      list.map((s, idx) => (idx === i ? { ...s, [field]: value } : s))
    );
  }

  function validateStep(): string {
    if (step === 0) {
      if (form.name.trim().length < 2) return r.errName;
      if (!/^\S+@\S+\.\S+$/.test(form.email)) return r.errEmail;
      if (form.phone.trim().length < 9) return r.errPhone;
      if (form.password.length < 6) return r.errPassword;
    }
    if (step === 1) {
      if (!form.category) return r.errCategory;
      if (form.headline.trim().length < 5) return r.errHeadline;
      if (form.bio.trim().length < 20) return r.errBio;
      if (!form.district) return r.errDistrict;
      if (!form.city.trim()) return r.errCity;
    }
    if (step === 3) {
      if (services.length === 0) return r.errServiceCount;
      for (const s of services) {
        if (s.title.trim().length < 2) return r.errServiceTitle;
        if (!s.price || Number(s.price) <= 0) return r.errServicePrice;
      }
    }
    return "";
  }

  function next() {
    const err = validateStep();
    if (err) {
      setError(err);
      return;
    }
    setError("");
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  async function submit() {
    const err = validateStep();
    if (err) {
      setError(err);
      return;
    }
    setLoading(true);
    setError("");
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        role: "PROVIDER",
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        password: form.password,
        category: form.category,
        headline: form.headline.trim(),
        bio: form.bio.trim(),
        district: form.district,
        city: form.city.trim(),
        experience: Number(form.experience) || 0,
        whatsapp: form.whatsapp.trim(),
        phone2: form.phone2.trim(),
        facebook: form.facebook.trim(),
        instagram: form.instagram.trim(),
        tiktok: form.tiktok.trim(),
        youtube: form.youtube.trim(),
        website: form.website.trim(),
        services: services.map((s) => ({
          title: s.title.trim(),
          description: s.description.trim() || undefined,
          price: Number(s.price),
          priceType: s.priceType,
        })),
      }),
    });
    setLoading(false);
    if (res.ok) {
      router.push("/dashboard?welcome=1");
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? r.createFailed);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <h1 className="text-2xl font-bold tracking-tight text-ink-900">
        {r.title}
      </h1>
      <p className="mt-1 text-sm text-ink-500">{r.subtitle}</p>

      <ol className="mt-8 flex items-center gap-2">
        {STEPS.map((label, i) => (
          <li key={label} className="flex flex-1 flex-col gap-1.5">
            <span
              className={`h-1.5 rounded-full transition ${
                i <= step ? "bg-brand-600" : "bg-ink-200"
              }`}
            />
            <span
              className={`hidden text-xs font-medium sm:block ${
                i <= step ? "text-brand-700" : "text-ink-500"
              }`}
            >
              {label}
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-2 text-sm font-medium text-ink-700 sm:hidden">
        {r.stepOf(step + 1, STEPS.length, STEPS[step])}
      </p>

      <div className="card mt-6 p-6">
        {step === 0 && (
          <div className="space-y-4">
            <div>
              <label className="label">{r.fullName}</label>
              <input
                className="input"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder={r.fullNamePh}
              />
            </div>
            <div>
              <label className="label">{r.email}</label>
              <input
                className="input"
                type="email"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                autoComplete="email"
              />
            </div>
            <div>
              <label className="label">{r.phone}</label>
              <input
                className="input"
                type="tel"
                placeholder="07X XXX XXXX"
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
              />
              <p className="mt-1 text-xs text-ink-500">{r.phoneHint}</p>
            </div>
            <div>
              <label className="label">{r.password}</label>
              <input
                className="input"
                type="password"
                value={form.password}
                onChange={(e) => set("password", e.target.value)}
                autoComplete="new-password"
              />
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <div>
              <label className="label">{r.serviceQuestion}</label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {categories.map((c) => (
                  <button
                    key={c.slug}
                    type="button"
                    onClick={() => set("category", c.slug)}
                    className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm transition ${
                      form.category === c.slug
                        ? "border-brand-500 bg-brand-50 font-medium text-brand-800"
                        : "border-ink-200 text-ink-600 hover:border-ink-300"
                    }`}
                  >
                    <CategoryIcon
                      slug={c.slug}
                      className={`h-4 w-4 shrink-0 ${
                        form.category === c.slug
                          ? "text-brand-600"
                          : "text-ink-500"
                      }`}
                    />
                    {categoryOptionLabel(c, locale)}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="label">{r.headline}</label>
              <input
                className="input"
                value={form.headline}
                onChange={(e) => set("headline", e.target.value)}
                placeholder={r.headlinePh}
                maxLength={120}
              />
            </div>
            <div>
              <label className="label">{r.about}</label>
              <textarea
                className="input min-h-32 resize-y"
                value={form.bio}
                onChange={(e) => set("bio", e.target.value)}
                placeholder={r.aboutPh}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="label">{r.district}</label>
                <select
                  className="input"
                  value={form.district}
                  onChange={(e) => set("district", e.target.value)}
                >
                  <option value="">{r.selectPlaceholder}</option>
                  {DISTRICTS.map((d) => (
                    <option key={d} value={d}>
                      {districtLabelLoc(d, locale)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">{r.townCity}</label>
                <input
                  className="input"
                  value={form.city}
                  onChange={(e) => set("city", e.target.value)}
                  placeholder={r.townCityPh}
                />
              </div>
              <div>
                <label className="label">{r.experience}</label>
                <input
                  className="input"
                  type="number"
                  min={0}
                  max={60}
                  value={form.experience}
                  onChange={(e) => set("experience", e.target.value)}
                />
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <p className="text-sm text-ink-500">{r.contactOptional}</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label">{r.whatsapp}</label>
                <input
                  className="input"
                  type="tel"
                  placeholder="94771234567"
                  value={form.whatsapp}
                  onChange={(e) => set("whatsapp", e.target.value)}
                />
              </div>
              <div>
                <label className="label">{r.altPhone}</label>
                <input
                  className="input"
                  type="tel"
                  value={form.phone2}
                  onChange={(e) => set("phone2", e.target.value)}
                />
              </div>
              <div>
                <label className="label">{r.facebook}</label>
                <input
                  className="input"
                  placeholder="facebook.com/yourpage"
                  value={form.facebook}
                  onChange={(e) => set("facebook", e.target.value)}
                />
              </div>
              <div>
                <label className="label">{r.instagram}</label>
                <input
                  className="input"
                  placeholder="instagram.com/yourprofile"
                  value={form.instagram}
                  onChange={(e) => set("instagram", e.target.value)}
                />
              </div>
              <div>
                <label className="label">{r.tiktok}</label>
                <input
                  className="input"
                  placeholder="tiktok.com/@you"
                  value={form.tiktok}
                  onChange={(e) => set("tiktok", e.target.value)}
                />
              </div>
              <div>
                <label className="label">{r.youtube}</label>
                <input
                  className="input"
                  placeholder="youtube.com/@yourchannel"
                  value={form.youtube}
                  onChange={(e) => set("youtube", e.target.value)}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="label">{r.website}</label>
                <input
                  className="input"
                  placeholder="www.yoursite.lk"
                  value={form.website}
                  onChange={(e) => set("website", e.target.value)}
                />
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <p className="text-sm text-ink-500">{r.servicesIntro}</p>
            {services.map((s, i) => (
              <div key={i} className="rounded-xl border border-ink-200 p-4">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                    {r.serviceN(i + 1)}
                  </span>
                  {services.length > 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        setServices((list) => list.filter((_, idx) => idx !== i))
                      }
                      className="text-xs font-medium text-red-500 hover:text-red-600"
                    >
                      {r.remove}
                    </button>
                  )}
                </div>
                <div className="mt-2 space-y-3">
                  <input
                    className="input"
                    placeholder={r.serviceTitlePh}
                    value={s.title}
                    onChange={(e) => setService(i, "title", e.target.value)}
                  />
                  <input
                    className="input"
                    placeholder={r.serviceDescPh}
                    value={s.description}
                    onChange={(e) =>
                      setService(i, "description", e.target.value)
                    }
                  />
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <input
                        className="input"
                        type="number"
                        min={1}
                        placeholder={r.pricePh}
                        value={s.price}
                        onChange={(e) => setService(i, "price", e.target.value)}
                      />
                    </div>
                    <select
                      className="input w-36"
                      value={s.priceType}
                      onChange={(e) =>
                        setService(i, "priceType", e.target.value)
                      }
                    >
                      {PRICE_TYPES.map((pt) => (
                        <option key={pt.value} value={pt.value}>
                          {priceTypeLabelLoc(pt.value, locale)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            ))}
            {services.length < 20 && (
              <button
                type="button"
                onClick={() => setServices((list) => [...list, { ...emptyService }])}
                className="btn-secondary w-full"
              >
                {r.addAnother}
              </button>
            )}
          </div>
        )}

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

        <div className="mt-6 flex items-center justify-between">
          {step > 0 ? (
            <button
              type="button"
              onClick={() => {
                setError("");
                setStep((s) => s - 1);
              }}
              className="btn-ghost"
            >
              {r.back}
            </button>
          ) : (
            <span />
          )}
          {step < STEPS.length - 1 ? (
            <button type="button" onClick={next} className="btn-primary">
              {r.continue}
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={loading}
              className="btn-primary"
            >
              {loading ? r.creating : r.create}
            </button>
          )}
        </div>
      </div>

      <p className="mt-6 text-center text-sm text-ink-500">
        {r.alreadyHave}{" "}
        <Link
          href="/login"
          className="font-semibold text-brand-600 hover:text-brand-700"
        >
          {r.signIn}
        </Link>
      </p>
    </div>
  );
}
