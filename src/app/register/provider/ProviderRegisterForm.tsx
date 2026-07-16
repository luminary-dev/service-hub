"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  DISTRICTS,
  MAX_SERVICE_DISTRICTS,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PRICE_TYPES,
} from "@/lib/constants";
import { categoryOptionLabel, type CategoryOption } from "@/lib/categories";
import { districtLabelLoc, priceTypeLabelLoc } from "@/lib/i18n";
import { localizedHref } from "@/lib/links";
import { errorMessage } from "@/lib/error-codes";
import { useLocale, useT } from "@/components/I18nProvider";
import { ConsentCheckbox } from "@/components/LegalConsent";
import PasswordInput from "@/components/PasswordInput";
import TurnstileWidget from "@/components/TurnstileWidget";
import CategoryIcon from "@/components/CategoryIcon";
import LocationPicker from "@/components/LocationPicker";
import ServiceDistrictsPicker from "@/components/ServiceDistrictsPicker";
import type { GeoPoint } from "@/lib/geo";
import {
  ErrorSummary,
  FormError,
  isValidEmail,
  useFieldErrors,
  type FieldErrors,
} from "@/components/ui/FormError";

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
  authed = false,
  turnstileSiteKey,
}: {
  categories: CategoryOption[];
  // Authenticated "complete your provider profile" mode (#398): the user is
  // already signed in (typically a fresh social signup), so the account step is
  // skipped and we POST the profile to /api/auth/complete-provider instead of
  // creating a new account via /api/auth/register.
  authed?: boolean;
  // Optional Turnstile site key (#633). Only used in guest (registration) mode
  // — complete-provider (authed) creates no account, so it isn't the
  // enumeration oracle this guards. Unset → no widget, submit as before.
  turnstileSiteKey?: string;
}) {
  // In authed mode the account step (0) is skipped entirely.
  const minStep = authed ? 1 : 0;
  const [step, setStep] = useState(minStep);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // Per-step validation errors keyed by field id, rendered as a focus-managed
  // summary with in-page links and mirrored onto the offending fields via
  // aria-invalid/aria-describedby (#378).
  const { fieldErrors, setFieldErrors, errorProps } = useFieldErrors();
  const router = useRouter();
  const locale = useLocale();
  const t = useT();
  const r = t.providerReg;
  const STEPS = r.steps;

  // On step change (not initial mount) move focus to the panel heading so
  // keyboard users land at the top of the new step and screen readers
  // announce it (#564).
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  const mountedRef = useRef(false);
  useEffect(() => {
    if (mountedRef.current) stepHeadingRef.current?.focus();
    else mountedRef.current = true;
  }, [step]);

  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    category: "",
    headline: "",
    bio: "",
    headlineSi: "",
    bioSi: "",
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
  // Extra served districts beyond the home district (#502) — the home
  // district is pinned by the picker and unioned in at submit time.
  const [serviceDistricts, setServiceDistricts] = useState<string[]>([]);
  // Optional map pin (#48): null means "no pin" — the picker only ever hands
  // back a complete in-bounds pair, so submit sends both coordinates or
  // neither.
  const [location, setLocation] = useState<GeoPoint | null>(null);
  const [agree, setAgree] = useState(false);
  // Turnstile token (#633) + reset nonce. Only relevant in guest mode — the
  // widget is rendered on the final step and gates the create submit.
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaReset, setCaptchaReset] = useState(0);
  const showCaptcha = !authed && Boolean(turnstileSiteKey);

  // Unsaved-changes protection (#763). The wizard holds everything in memory, so
  // an accidental back/close/tab-switch several steps in (bio, districts,
  // services, photos) silently discarded everything — a high-abandonment moment
  // in the core acquisition funnel. We persist step state to sessionStorage
  // (rehydrated on mount) and register a beforeunload prompt while the form is
  // dirty. The password is deliberately never persisted (only kept in memory).
  const DRAFT_KEY = authed
    ? "baaslk:provider-register:authed"
    : "baaslk:provider-register";
  const rehydratedRef = useRef(false);

  // Rehydrate a saved draft once, on mount (sessionStorage is client-only, so
  // this can't run in a useState initializer during SSR). Setting state from a
  // one-shot mount effect is the intended pattern here — the cascade is a single
  // extra render on load, not a loop.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      if (raw) {
        const d = JSON.parse(raw) as {
          step?: number;
          form?: Record<string, string>;
          services?: ServiceInput[];
          serviceDistricts?: string[];
          location?: GeoPoint | null;
          agree?: boolean;
        };
        if (d.form) setForm((f) => ({ ...f, ...d.form, password: "" }));
        if (Array.isArray(d.services) && d.services.length > 0)
          setServices(d.services);
        if (Array.isArray(d.serviceDistricts))
          setServiceDistricts(d.serviceDistricts);
        if (d.location) setLocation(d.location);
        if (typeof d.agree === "boolean") setAgree(d.agree);
        if (typeof d.step === "number")
          setStep(Math.max(minStep, Math.min(d.step, STEPS.length - 1)));
      }
    } catch {
      // A corrupt/foreign draft must never wedge the form — start fresh.
    }
    rehydratedRef.current = true;
    /* eslint-enable react-hooks/set-state-in-effect */
    // Run once; the identity of the setters is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist the draft on every change (never the password).
  useEffect(() => {
    if (!rehydratedRef.current) return; // don't clobber before we've rehydrated
    const formToPersist: Record<string, string> = {};
    for (const [k, v] of Object.entries(form))
      if (k !== "password") formToPersist[k] = v;
    try {
      sessionStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({
          step,
          form: formToPersist,
          services,
          serviceDistricts,
          location,
          agree,
        })
      );
    } catch {
      // Storage full/blocked (private mode) — persistence is best-effort.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, form, services, serviceDistricts, location, agree]);

  const isDirty =
    step !== minStep ||
    Object.entries(form).some(([, v]) => v !== "") ||
    services.some(
      (s) => s.title || s.description || s.price || s.priceType !== "FIXED"
    ) ||
    serviceDistricts.length > 0 ||
    location !== null ||
    agree;

  // Native beforeunload prompt while dirty (close tab / reload / external nav).
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function setService(i: number, field: keyof ServiceInput, value: string) {
    setServices((list) =>
      list.map((s, idx) => (idx === i ? { ...s, [field]: value } : s)),
    );
  }

  function validateStep(): FieldErrors {
    const errs: FieldErrors = {};
    if (step === 0) {
      if (form.name.trim().length < 2) errs["pr-name"] = r.errName;
      if (!isValidEmail(form.email)) errs["pr-email"] = r.errEmail;
      if (form.phone.trim().length < 9) errs["pr-phone"] = r.errPhone;
      if (form.password.length < PASSWORD_MIN_LENGTH)
        errs["pr-password"] = r.errPassword;
    }
    if (step === 1) {
      // Authed mode skips step 0, so the (required) phone is collected and
      // validated here instead (#552).
      if (authed && form.phone.trim().length < 9)
        errs["pr-phone"] = r.errPhone;
      if (!form.category) errs["pr-category"] = r.errCategory;
      if (form.headline.trim().length < 5) errs["pr-headline"] = r.errHeadline;
      if (form.bio.trim().length < 20) errs["pr-bio"] = r.errBio;
      if (!form.district) errs["pr-district"] = r.errDistrict;
      // Served-set cap (#502): the picker disables further picks at the cap,
      // so this only trips if the state drifts — mirrors the server's guard.
      if (
        [form.district, ...serviceDistricts.filter((d) => d !== form.district)]
          .length > MAX_SERVICE_DISTRICTS
      )
        errs["pr-service-districts"] = t.serviceDistricts.limitReached;
      if (!form.city.trim()) errs["pr-city"] = r.errCity;
    }
    if (step === 3) {
      if (services.length === 0) errs["pr-services"] = r.errServiceCount;
      services.forEach((s, i) => {
        if (s.title.trim().length < 2)
          errs[`pr-service-${i}-title`] = r.errServiceTitle(i + 1);
        if (!s.price || Number(s.price) <= 0)
          errs[`pr-service-${i}-price`] = r.errServicePrice(i + 1);
      });
      if (!agree) errs["pr-agree"] = t.legal.errAgree;
      // Bot check (#633): only when the widget is present (guest + site key).
      if (showCaptcha && !captchaToken)
        errs["cf-turnstile"] = t.turnstile.required;
    }
    return errs;
  }

  function next() {
    const errs = validateStep();
    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setError("");
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  async function submit() {
    if (loading) return;
    const errs = validateStep();
    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setLoading(true);
    setError("");
    // Shared profile fields. In authed mode name/email/password/role are
    // omitted — the API takes name/email from the signed-in user and only
    // flips the role.
    const profile = {
      phone: form.phone.trim(),
      category: form.category,
      headline: form.headline.trim(),
      bio: form.bio.trim(),
      // Optional Sinhala variants (#515) — send undefined when blank so the
      // API stores null.
      headlineSi: form.headlineSi.trim() || undefined,
      bioSi: form.bioSi.trim() || undefined,
      district: form.district,
      // Full served set (#502): home district first, extras after.
      serviceDistricts: [
        form.district,
        ...serviceDistricts.filter((d) => d !== form.district),
      ],
      city: form.city.trim(),
      // Optional map pin (#48) — omitted entirely (undefined → dropped by
      // JSON.stringify) when the provider skipped it.
      latitude: location?.latitude,
      longitude: location?.longitude,
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
    };
    try {
      const res = await fetch(
        authed ? "/api/auth/complete-provider" : "/api/auth/register",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            authed
              ? profile
              : {
                  role: "PROVIDER",
                  name: form.name.trim(),
                  email: form.email.trim(),
                  password: form.password,
                  // Dropped by JSON.stringify when empty → identity skips it.
                  turnstileToken: captchaToken || undefined,
                  ...profile,
                },
          ),
        },
      );
      if (res.ok) {
        // Draft consumed (#763): clear it so a later visit starts clean, and
        // the beforeunload guard won't fire on this successful navigation.
        try {
          sessionStorage.removeItem(DRAFT_KEY);
        } catch {
          /* best-effort */
        }
        router.push(localizedHref("/dashboard?welcome=1", locale));
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(errorMessage(data, r.createFailed, t.errorCodes));
        // The single-use token is spent — fetch a fresh one for the retry.
        if (showCaptcha) setCaptchaReset((n) => n + 1);
      }
    } catch {
      // Network failure — recover instead of wedging the submit button (#431).
      setError(r.createFailed);
      if (showCaptcha) setCaptchaReset((n) => n + 1);
    } finally {
      setLoading(false);
    }
  }

  const pct = Math.round(((step + 1) / STEPS.length) * 100);

  return (
    <div className="blueprint-grid">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:px-6 lg:grid-cols-[minmax(0,320px)_1fr] lg:gap-12">
        {/* Spec sidebar */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-700">
            FORM-01 / PROVIDER
          </div>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-ink-900">
            {r.title}
          </h1>
          <p className="mt-2 text-sm text-ink-600">{r.subtitle}</p>

          {/* Completion gauge */}
          <div className="mt-7">
            <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.12em] text-ink-400">
              <span>{r.stepOf(step + 1, STEPS.length, STEPS[step])}</span>
              <span className="text-brand-700">{pct}%</span>
            </div>
            <div className="mt-1.5 h-2 w-full overflow-hidden rounded-sm border border-ink-300 bg-ink-100">
              <div
                className="h-full bg-brand-600 transition-[width] duration-500 ease-snap"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>

          {/* Wiring-diagram stepper */}
          <ol className="relative mt-8 ml-3 space-y-6 border-l-2 border-ink-200 pl-7">
            <span
              className="absolute -left-[2px] top-0 w-[2px] bg-brand-600 transition-[height] duration-500 ease-snap"
              style={{ height: `${(step / (STEPS.length - 1)) * 100}%` }}
              aria-hidden
            />
            {STEPS.map((label, i) => {
              const done = i < step;
              const active = i === step;
              return (
                <li
                  key={label}
                  className="relative"
                  aria-current={active ? "step" : undefined}
                >
                  <span
                    aria-hidden
                    className={`absolute -left-[38px] flex h-7 w-7 items-center justify-center rounded-sm border-2 font-mono text-[10px] font-bold transition ${
                      done
                        ? "border-brand-600 bg-brand-600 text-white dark:text-ink-50"
                        : active
                          ? "border-brand-600 bg-surface text-brand-700"
                          : "border-ink-300 bg-surface text-ink-400"
                    }`}
                  >
                    {done ? "✓" : String(i + 1).padStart(2, "0")}
                  </span>
                  <span
                    className={`block text-sm font-semibold ${
                      active || done ? "text-ink-900" : "text-ink-500"
                    }`}
                  >
                    {label}
                    {done && (
                      <span className="sr-only"> ({r.stepCompleted})</span>
                    )}
                  </span>
                </li>
              );
            })}
          </ol>

          {/* Worker photo */}
          <figure className="tech-corners relative mt-8 hidden aspect-[4/3] overflow-hidden border border-ink-300 lg:block">
            <Image
              src="/images/workers/electrician-1.jpg"
              alt={r.asideWorkerAlt}
              fill
              sizes="320px"
              className="object-cover"
            />
            <div className="blueprint-grid pointer-events-none absolute inset-0 opacity-25 mix-blend-overlay" />
            <span className="absolute left-2 top-2 rounded-sm bg-brand-700 px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider text-white dark:text-ink-50">
              {r.asideBadge}
            </span>
          </figure>
        </aside>

        {/* Form panel */}
        <div>
          <div className="tech-corners overflow-hidden rounded-lg border border-ink-300 bg-surface">
            <div className="flex items-center justify-between border-b border-ink-200 bg-ink-100 px-5 py-3 font-mono text-[11px] uppercase tracking-[0.12em]">
              <span aria-hidden className="font-bold tabular-nums text-ink-700">
                {String(step + 1).padStart(2, "0")} /{" "}
                {String(STEPS.length).padStart(2, "0")}
              </span>
              {/* Focus target on step change (#564): the sr-only text reads
                  the full "Step n of N" context the visual chrome splits up. */}
              <h2
                ref={stepHeadingRef}
                tabIndex={-1}
                className="text-brand-700 focus:outline-none"
              >
                <span className="sr-only">
                  {r.stepOf(step + 1, STEPS.length, STEPS[step])}
                </span>
                <span aria-hidden>{STEPS[step]}</span>
              </h2>
            </div>
            {/* One <form> per step: Continue/Create is its submit button, so
                Enter in a field advances the wizard (#564). Validation stays
                in JS for localized messages, hence noValidate. */}
            <form
              className="p-6"
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                if (step < STEPS.length - 1) next();
                else void submit();
              }}
            >
        {step === 0 && (
          <div className="space-y-4">
            <div>
              <label className="label" htmlFor="pr-name">
                {r.fullName}
              </label>
              <input
                id="pr-name"
                className="input"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder={r.fullNamePh}
                {...errorProps("pr-name")}
              />
            </div>
            <div>
              <label className="label" htmlFor="pr-email">
                {r.email}
              </label>
              <input
                id="pr-email"
                className="input"
                type="email"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                autoComplete="email"
                {...errorProps("pr-email")}
              />
            </div>
            <div>
              <label className="label" htmlFor="pr-phone">
                {r.phone}
              </label>
              <input
                id="pr-phone"
                className="input"
                type="tel"
                placeholder="07X XXX XXXX"
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
                {...errorProps("pr-phone")}
              />
              <p className="mt-1 text-xs text-ink-500">{r.phoneHint}</p>
            </div>
            <div>
              <label className="label" htmlFor="pr-password">
                {r.password}
              </label>
              <PasswordInput
                id="pr-password"
                value={form.password}
                onChange={(e) => set("password", e.target.value)}
                minLength={PASSWORD_MIN_LENGTH}
                maxLength={PASSWORD_MAX_LENGTH}
                autoComplete="new-password"
                {...errorProps("pr-password")}
              />
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            {authed && (
              <div>
                <label className="label" htmlFor="pr-phone">
                  {r.phone}
                </label>
                <input
                  id="pr-phone"
                  className="input"
                  type="tel"
                  placeholder="07X XXX XXXX"
                  value={form.phone}
                  onChange={(e) => set("phone", e.target.value)}
                  {...errorProps("pr-phone")}
                />
                <p className="mt-1 text-xs text-ink-500">{r.phoneHint}</p>
              </div>
            )}
            <div>
              {/* The category picker is a group of toggle buttons, not a
                  single field — a <label> has nothing to point at, so the
                  group is named via aria-labelledby instead. */}
              <span className="label" id="pr-category-label">
                {r.serviceQuestion}
              </span>
              {/* id + tabIndex let the error-summary link land focus here;
                  aria-invalid is not valid on `group`, so only the error text
                  is linked via aria-describedby. */}
              <div
                role="group"
                id="pr-category"
                tabIndex={-1}
                aria-labelledby="pr-category-label"
                aria-describedby={
                  fieldErrors["pr-category"] ? "pr-category-error" : undefined
                }
                className="grid grid-cols-2 gap-2 focus:outline-none sm:grid-cols-3"
              >
                {categories.map((c) => (
                  <button
                    key={c.slug}
                    type="button"
                    aria-pressed={form.category === c.slug}
                    onClick={() => set("category", c.slug)}
                    className={`flex items-center gap-2 rounded-sm border px-3 py-2.5 text-left text-sm transition ${
                      form.category === c.slug
                        ? "border-brand-600 bg-brand-600 font-semibold text-white dark:text-ink-50"
                        : "border-ink-300 text-ink-600 hover:border-brand-400 hover:bg-brand-50"
                    }`}
                  >
                    <CategoryIcon
                      slug={c.slug}
                      className={`h-4 w-4 shrink-0 ${
                        form.category === c.slug
                          ? "text-white dark:text-ink-50"
                          : "text-brand-600"
                      }`}
                    />
                    {categoryOptionLabel(c, locale)}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="label" htmlFor="pr-headline">
                {r.headline}
              </label>
              <input
                id="pr-headline"
                className="input"
                value={form.headline}
                onChange={(e) => set("headline", e.target.value)}
                placeholder={r.headlinePh}
                maxLength={120}
                {...errorProps("pr-headline")}
              />
            </div>
            <div>
              <label className="label" htmlFor="pr-bio">
                {r.about}
              </label>
              <textarea
                id="pr-bio"
                className="input min-h-32 resize-y"
                value={form.bio}
                onChange={(e) => set("bio", e.target.value)}
                placeholder={r.aboutPh}
                {...errorProps("pr-bio")}
              />
            </div>
            {/* Optional Sinhala variants (#515): shown to visitors browsing in
                Sinhala; English stays the required source of truth. */}
            <div>
              <label className="label" htmlFor="pr-headline-si">
                {r.headlineSi}
              </label>
              <input
                id="pr-headline-si"
                className="input"
                value={form.headlineSi}
                onChange={(e) => set("headlineSi", e.target.value)}
                placeholder={r.headlineSiPh}
                maxLength={120}
                lang="si"
              />
            </div>
            <div>
              <label className="label" htmlFor="pr-bio-si">
                {r.aboutSi}
              </label>
              <textarea
                id="pr-bio-si"
                className="input min-h-32 resize-y"
                value={form.bioSi}
                onChange={(e) => set("bioSi", e.target.value)}
                placeholder={r.aboutSiPh}
                maxLength={2000}
                lang="si"
              />
              <p className="mt-1 text-xs text-ink-500">{r.sinhalaOptional}</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="label" htmlFor="pr-district">
                  {r.district}
                </label>
                <select
                  id="pr-district"
                  className="input"
                  value={form.district}
                  onChange={(e) => set("district", e.target.value)}
                  {...errorProps("pr-district")}
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
                <label className="label" htmlFor="pr-city">
                  {r.townCity}
                </label>
                <input
                  id="pr-city"
                  className="input"
                  value={form.city}
                  onChange={(e) => set("city", e.target.value)}
                  placeholder={r.townCityPh}
                  {...errorProps("pr-city")}
                />
              </div>
              <div>
                <label className="label" htmlFor="pr-experience">
                  {r.experience}
                </label>
                <input
                  id="pr-experience"
                  className="input"
                  type="number"
                  min={0}
                  max={60}
                  value={form.experience}
                  onChange={(e) => set("experience", e.target.value)}
                />
              </div>
            </div>
            {/* Multi-district service area (#502). */}
            <ServiceDistrictsPicker
              id="pr-service-districts"
              primary={form.district}
              value={serviceDistricts}
              onChange={setServiceDistricts}
              hasError={Boolean(fieldErrors["pr-service-districts"])}
            />
            {/* Optional map pin (#48): pre-centered on the chosen district's
                centroid; entirely skippable. */}
            <LocationPicker
              id="pr-location"
              value={location}
              onChange={setLocation}
              district={form.district}
            />
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <p className="text-sm text-ink-500">{r.contactOptional}</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="pr-whatsapp">
                  {r.whatsapp}
                </label>
                <input
                  id="pr-whatsapp"
                  className="input"
                  type="tel"
                  placeholder="94771234567"
                  value={form.whatsapp}
                  onChange={(e) => set("whatsapp", e.target.value)}
                />
              </div>
              <div>
                <label className="label" htmlFor="pr-phone2">
                  {r.altPhone}
                </label>
                <input
                  id="pr-phone2"
                  className="input"
                  type="tel"
                  value={form.phone2}
                  onChange={(e) => set("phone2", e.target.value)}
                />
              </div>
              <div>
                <label className="label" htmlFor="pr-facebook">
                  {r.facebook}
                </label>
                <input
                  id="pr-facebook"
                  className="input"
                  placeholder="facebook.com/yourpage"
                  value={form.facebook}
                  onChange={(e) => set("facebook", e.target.value)}
                />
              </div>
              <div>
                <label className="label" htmlFor="pr-instagram">
                  {r.instagram}
                </label>
                <input
                  id="pr-instagram"
                  className="input"
                  placeholder="instagram.com/yourprofile"
                  value={form.instagram}
                  onChange={(e) => set("instagram", e.target.value)}
                />
              </div>
              <div>
                <label className="label" htmlFor="pr-tiktok">
                  {r.tiktok}
                </label>
                <input
                  id="pr-tiktok"
                  className="input"
                  placeholder="tiktok.com/@you"
                  value={form.tiktok}
                  onChange={(e) => set("tiktok", e.target.value)}
                />
              </div>
              <div>
                <label className="label" htmlFor="pr-youtube">
                  {r.youtube}
                </label>
                <input
                  id="pr-youtube"
                  className="input"
                  placeholder="youtube.com/@yourchannel"
                  value={form.youtube}
                  onChange={(e) => set("youtube", e.target.value)}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="label" htmlFor="pr-website">
                  {r.website}
                </label>
                <input
                  id="pr-website"
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
          <div id="pr-services" tabIndex={-1} className="space-y-4">
            <p className="text-sm text-ink-500">{r.servicesIntro}</p>
            {services.map((s, i) => (
              <div key={i} className="rounded-sm border border-ink-300 bg-ink-50 p-4">
                <div className="flex items-start justify-between gap-2">
                  <span className="rounded-sm bg-ink-200 px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-ink-600">
                    {r.serviceN(i + 1)}
                  </span>
                  {services.length > 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        setServices((list) =>
                          list.filter((_, idx) => idx !== i),
                        )
                      }
                      className="text-xs font-medium text-red-500 hover:text-red-600"
                    >
                      {r.remove}
                    </button>
                  )}
                </div>
                <div className="mt-2 space-y-3">
                  <input
                    id={`pr-service-${i}-title`}
                    className="input"
                    placeholder={r.serviceTitlePh}
                    aria-label={r.serviceTitlePh}
                    value={s.title}
                    onChange={(e) => setService(i, "title", e.target.value)}
                    {...errorProps(`pr-service-${i}-title`)}
                  />
                  <input
                    className="input"
                    placeholder={r.serviceDescPh}
                    aria-label={r.serviceDescPh}
                    value={s.description}
                    onChange={(e) =>
                      setService(i, "description", e.target.value)
                    }
                  />
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <input
                        id={`pr-service-${i}-price`}
                        className="input"
                        type="number"
                        min={1}
                        placeholder={r.pricePh}
                        aria-label={r.pricePh}
                        value={s.price}
                        onChange={(e) => setService(i, "price", e.target.value)}
                        {...errorProps(`pr-service-${i}-price`)}
                      />
                    </div>
                    <select
                      className="input w-36"
                      aria-label={r.priceType}
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
                onClick={() =>
                  setServices((list) => [...list, { ...emptyService }])
                }
                className="btn-secondary w-full"
              >
                {r.addAnother}
              </button>
            )}
            <ConsentCheckbox
              id="pr-agree"
              checked={agree}
              onChange={setAgree}
              {...errorProps("pr-agree")}
            />
            {/* Bot protection (#633) — guest registration only. */}
            {showCaptcha && (
              <div>
                <span className="label" id="cf-turnstile-label">
                  {t.turnstile.label}
                </span>
                <TurnstileWidget
                  id="cf-turnstile"
                  siteKey={turnstileSiteKey}
                  language={locale}
                  onToken={setCaptchaToken}
                  resetNonce={captchaReset}
                />
                {fieldErrors["cf-turnstile"] && (
                  <p
                    id="cf-turnstile-error"
                    role="alert"
                    className="mt-1 text-xs text-red-600"
                  >
                    {fieldErrors["cf-turnstile"]}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        <ErrorSummary
          title={t.fieldErrors.summaryTitle}
          errors={fieldErrors}
          className="mt-4"
        />
        <FormError className="mt-4">{error}</FormError>

        <div className="mt-6 flex items-center justify-between">
          {step > minStep ? (
            <button
              type="button"
              onClick={() => {
                setError("");
                setFieldErrors({});
                setStep((s) => Math.max(s - 1, minStep));
              }}
              className="btn-ghost"
            >
              {r.back}
            </button>
          ) : (
            <span />
          )}
          {step < STEPS.length - 1 ? (
            <button type="submit" className="btn-primary">
              {r.continue}
            </button>
          ) : (
            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? r.creating : r.create}
            </button>
          )}
            </div>
            </form>
          </div>

          <p className="mt-6 text-center text-sm text-ink-500">
            {r.alreadyHave}{" "}
            <Link
              href={localizedHref("/login", locale)}
              className="font-semibold text-brand-600 hover:text-brand-700"
            >
              {r.signIn}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
