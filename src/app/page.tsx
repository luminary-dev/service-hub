import type { Metadata } from "next";
import Link from "next/link";
import {
  FaArrowRight,
  FaCheck,
  FaPhone,
  FaStar,
  FaWhatsapp,
} from "react-icons/fa6";
import { apiJson } from "@/lib/api";
import { CATEGORIES } from "@/lib/constants";
import { dict, categoryLabelLoc } from "@/lib/i18n";
import { languageAlternates, localizedHref } from "@/lib/links";
import { getLocale, getUrlLocale } from "@/lib/locale";
import { getSession } from "@/lib/auth";
import ProviderCard, { ProviderCardDTO } from "@/components/ProviderCard";
import SearchBar from "@/components/SearchBar";

// hreflang pair (#67): en at the root, si at /si, each its own canonical.
export async function generateMetadata(): Promise<Metadata> {
  return { alternates: languageAlternates("/", await getUrlLocale()) };
}

// Caching (#57): public-and-stable. No force-dynamic — the page still
// renders per request (locale/session cookies below), but the hero stats and
// the "newest providers" rail are the same for everyone and come from the
// Data Cache with a 5-minute revalidate instead of hitting the gateway (and
// the database behind it) on every request. Favorites stay per-user/no-store.
export default async function HomePage() {
  const [locale, listing, stats] = await Promise.all([
    getLocale(),
    apiJson<{ providers: ProviderCardDTO[] }>(
      "/api/providers?sort=newest&pageSize=6",
      { revalidate: 300 }
    ),
    apiJson<{ providerCount: number; reviewCount: number }>("/api/stats", {
      revalidate: 300,
    }),
  ]);
  const t = dict[locale];
  const providerCount = stats?.providerCount ?? 0;
  const reviewCount = stats?.reviewCount ?? 0;
  const session = await getSession();
  const favorites = session
    ? await apiJson<{ providerIds: string[] }>("/api/favorites")
    : null;
  const favoriteIds = new Set(favorites?.providerIds ?? []);

  const featured: ProviderCardDTO[] = listing?.providers ?? [];
  const gridCats = CATEGORIES.slice(0, 8);

  return (
    <div>
      {/* ── HERO ─────────────────────────────────────────────────────── */}
      <section className="border-b border-ink-200 bg-surface">
        <div className="mx-auto grid max-w-6xl gap-14 px-4 py-16 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:py-24">
          <div>
            <div className="eyebrow">{t.nav.find}</div>
            <h1 className="mt-4 text-4xl font-semibold leading-[1.1] tracking-tight text-ink-900 sm:text-[3.25rem]">
              {t.home.heroTitle1}
              <span className="text-brand-700">{t.home.heroTitle2}</span>
            </h1>
            <p className="mt-5 max-w-[52ch] text-lg leading-relaxed text-ink-600">
              {t.home.heroSub}
            </p>

            <div className="card mt-8 max-w-xl p-4">
              <label className="mb-2.5 block text-sm font-medium text-ink-700">
                {t.home.catHeading}
              </label>
              <SearchBar />
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                <span className="text-ink-500">{t.home.popular}</span>
                {t.home.popularChips.map(([label, q]) => (
                  <Link
                    key={q}
                    href={localizedHref(
                      `/providers?q=${encodeURIComponent(q)}`,
                      locale
                    )}
                    className="rounded-full border border-ink-200 bg-surface px-3 py-1 font-medium text-ink-600 transition-[border-color,color] duration-200 ease-snap hover:border-brand-400 hover:text-brand-700"
                  >
                    {label}
                  </Link>
                ))}
              </div>
            </div>

            <p className="mt-6 text-sm text-ink-500">
              {t.home.statsLine(providerCount, CATEGORIES.length, reviewCount)}
            </p>
          </div>

          {/* Clean product visual: a trusted provider profile preview */}
          <div className="relative mx-auto hidden w-80 lg:block" aria-hidden>
            {/* soft depth panel behind the card */}
            <div className="absolute -inset-4 -z-10 rounded-3xl bg-brand-50/60" />
            <div className="card relative w-80 overflow-hidden p-5 shadow-[0_20px_50px_rgba(34,29,24,0.10)]">
              <div className="flex items-center gap-3">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-800">
                  KW
                </span>
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-ink-900">
                    Kumari W.
                    <FaCheck className="h-3 w-3 rounded-full bg-brand-600 p-0.5 text-white" />
                  </p>
                  <p className="text-xs text-ink-500">
                    {categoryLabelLoc("garden-designer", locale)} ·{" "}
                    {locale === "si" ? "මහනුවර" : "Kandy"}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-1 text-amber-400">
                {[1, 2, 3, 4, 5].map((i) => (
                  <FaStar key={i} className="h-3.5 w-3.5" />
                ))}
                <span className="ml-1 text-xs font-medium text-ink-600">5.0</span>
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-ink-100 pt-4">
                <span className="text-xs text-ink-500">{t.home.cardConsult}</span>
                <span className="text-sm font-semibold text-brand-700">
                  Rs. 5,000
                </span>
              </div>
              <div className="mt-3 flex gap-2">
                <span className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-brand-700 py-2 text-xs font-semibold text-white dark:text-ink-50">
                  <FaPhone className="h-3 w-3" /> {t.home.cardCall}
                </span>
                <span className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#25D366] py-2 text-xs font-semibold text-white">
                  <FaWhatsapp className="h-3.5 w-3.5" /> WhatsApp
                </span>
              </div>
            </div>

            <div className="card absolute -right-4 -top-5 flex items-center gap-2 px-3 py-2 shadow-[0_10px_24px_rgba(34,29,24,0.08)]">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                <FaCheck className="h-3 w-3" />
              </span>
              <span className="text-xs font-medium text-ink-700">
                {t.home.cardAnswered}
              </span>
            </div>

            <div className="card absolute left-2 top-full mt-5 w-64 p-4 shadow-[0_10px_24px_rgba(34,29,24,0.08)]">
              <p className="text-sm leading-relaxed text-ink-700">
                {t.home.cardQuote}
              </p>
              <p className="mt-2 text-xs font-medium text-ink-500">
                {t.home.cardQuoteBy}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── CATEGORIES ───────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="eyebrow">{t.home.popular}</div>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-ink-900 sm:text-3xl">
              {t.home.catHeading}
            </h2>
          </div>
          <Link
            href={localizedHref("/providers", locale)}
            className="group inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:text-brand-800"
          >
            {t.home.viewAll}
            <FaArrowRight className="h-3 w-3 transition-transform duration-200 ease-snap group-hover:translate-x-0.5" />
          </Link>
        </div>
        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {gridCats.map((c) => (
            <Link
              key={c.slug}
              href={localizedHref(`/providers?category=${c.slug}`, locale)}
              className="group flex items-center gap-3.5 rounded-xl border border-ink-200 bg-surface p-4 transition-[border-color,box-shadow,transform] duration-200 ease-snap hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-[0_10px_24px_rgba(34,29,24,0.07)]"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50">
                <c.icon className="h-4.5 w-4.5 text-brand-700" />
              </span>
              <span className="font-medium text-ink-900">
                {categoryLabelLoc(c.slug, locale)}
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* ── FEATURED PROS ────────────────────────────────────────────── */}
      {featured.length > 0 && (
        <section className="border-y border-ink-200 bg-ink-100">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <div className="mb-8">
              <div className="eyebrow">{t.home.viewAll}</div>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight text-ink-900 sm:text-3xl">
                {t.home.featuredHeading}
              </h2>
              <p className="mt-2 text-ink-600">{t.home.featuredSub}</p>
            </div>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {featured.map((p, i) => (
                <div
                  key={p.id}
                  className="rise"
                  style={{ "--rise-index": i } as React.CSSProperties}
                >
                  <ProviderCard
                    p={p}
                    locale={locale}
                    showFavorite={!!session}
                    favorited={favoriteIds.has(p.id)}
                  />
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── HOW IT WORKS / TRUST ─────────────────────────────────────── */}
      <section className="mx-auto grid max-w-6xl gap-14 px-4 py-24 sm:px-6 lg:grid-cols-[0.85fr_1.15fr]">
        <div>
          <div className="eyebrow">{t.home.trustCta}</div>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-ink-900 sm:text-3xl">
            {t.home.trustHeading}
          </h2>
          <p className="mt-4 max-w-[52ch] leading-relaxed text-ink-600">
            {t.home.trustBody}
          </p>
          <Link
            href={localizedHref("/providers", locale)}
            className="btn-primary mt-7"
          >
            {t.home.trustCta}
          </Link>
        </div>
        <ol className="grid gap-x-10 gap-y-2 sm:grid-cols-2">
          {t.home.steps.map((s, i) => (
            <li
              key={s.title}
              className="rounded-xl border border-ink-200 bg-surface p-5"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-sm font-semibold text-brand-700">
                {i + 1}
              </span>
              <h3 className="mt-3 font-semibold text-ink-900">{s.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-600">
                {s.body}
              </p>
            </li>
          ))}
        </ol>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────────── */}
      <section className="bg-surface">
        <div className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-8 rounded-2xl bg-brand-700 px-8 py-14 dark:bg-brand-50 sm:px-12">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                {t.home.ctaHeading}
              </h2>
              <p className="mt-3 max-w-[55ch] leading-relaxed text-brand-100 dark:text-brand-900">
                {t.home.ctaBody}
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/register/provider"
                className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-white px-6 py-3 font-display text-sm font-semibold text-brand-800 transition-transform duration-200 ease-snap hover:-translate-y-0.5 active:scale-[0.97] dark:bg-brand-700 dark:text-ink-50"
              >
                {t.home.ctaCreate}
              </Link>
              <Link
                href={localizedHref("/providers", locale)}
                className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-brand-400 px-6 py-3 font-display text-sm font-semibold text-white transition-[border-color,background-color,transform] duration-200 ease-snap hover:border-brand-300 hover:bg-brand-600 active:scale-[0.97] dark:hover:bg-white/10"
              >
                {t.home.ctaSee}
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
