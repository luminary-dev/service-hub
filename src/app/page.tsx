import Link from "next/link";
import {
  FaArrowRight,
  FaCheck,
  FaPhone,
  FaStar,
  FaWhatsapp,
} from "react-icons/fa6";
import { db } from "@/lib/db";
import { CATEGORIES } from "@/lib/constants";
import { dict, categoryLabelLoc } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";
import ProviderCard, { ProviderSummary } from "@/components/ProviderCard";
import SearchBar from "@/components/SearchBar";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [locale, providers, providerCount, reviewCount] = await Promise.all([
    getLocale(),
    db.provider.findMany({
      include: {
        user: { select: { name: true } },
        services: { orderBy: { price: "asc" }, take: 1 },
        photos: { take: 1, orderBy: { createdAt: "desc" } },
        reviews: { select: { rating: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 6,
    }),
    db.provider.count(),
    db.review.count(),
  ]);
  const t = dict[locale];

  const featured: ProviderSummary[] = providers.map((p) => ({
    id: p.id,
    name: p.user.name,
    category: p.category,
    headline: p.headline,
    district: p.district,
    city: p.city,
    experience: p.experience,
    available: p.available,
    avatarUrl: p.avatarUrl,
    coverPhoto: p.photos[0]?.url ?? null,
    fromPrice: p.services[0]?.price ?? null,
    fromPriceType: p.services[0]?.priceType ?? null,
    rating: p.reviews.length
      ? p.reviews.reduce((s, r) => s + r.rating, 0) / p.reviews.length
      : null,
    reviewCount: p.reviews.length,
  }));

  return (
    <div>
      <section className="border-b border-ink-200 bg-white">
        <div className="mx-auto grid max-w-6xl gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:py-24">
          <div>
            <h1 className="rise text-4xl font-semibold leading-[1.15] tracking-tight text-ink-900 sm:text-5xl">
              {t.home.heroTitle1}
              <span className="text-brand-600">{t.home.heroTitle2}</span>
            </h1>
            <p
              className="rise mt-5 max-w-[58ch] text-base leading-relaxed text-ink-600 sm:text-lg"
              style={{ "--rise-index": 1 } as React.CSSProperties}
            >
              {t.home.heroSub}
            </p>
            <div
              className="rise mt-8 max-w-xl"
              style={{ "--rise-index": 2 } as React.CSSProperties}
            >
              <SearchBar />
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                <span className="text-ink-500">{t.home.popular}</span>
                {t.home.popularChips.map(([label, q]) => (
                  <Link
                    key={q}
                    href={`/providers?q=${encodeURIComponent(q)}`}
                    className="rounded-full border border-ink-200 bg-white px-3 py-1 font-medium text-ink-600 transition-[border-color,color] duration-200 ease-snap hover:border-brand-400 hover:text-brand-700"
                  >
                    {label}
                  </Link>
                ))}
              </div>
            </div>
            <p
              className="rise mt-8 text-sm font-medium text-ink-600"
              style={{ "--rise-index": 3 } as React.CSSProperties}
            >
              {t.home.statsLine(providerCount, CATEGORIES.length, reviewCount)}
            </p>
          </div>

          <div className="relative hidden lg:block" aria-hidden>
            <div
              className="rise card mx-auto w-72 p-5"
              style={{ "--rise-index": 2 } as React.CSSProperties}
            >
              <div className="flex items-center gap-3">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-800">
                  KW
                </span>
                <div>
                  <p className="text-sm font-semibold text-ink-900">
                    Kumari W.
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
                <span className="ml-1 text-xs font-medium text-ink-600">
                  5.0
                </span>
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-ink-100 pt-3">
                <span className="text-xs text-ink-500">
                  {t.home.cardConsult}
                </span>
                <span className="text-sm font-semibold text-brand-700">
                  Rs. 5,000
                </span>
              </div>
              <div className="mt-3 flex gap-2">
                <span className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full bg-brand-700 py-1.5 text-xs font-semibold text-white">
                  <FaPhone className="h-3 w-3" /> {t.home.cardCall}
                </span>
                <span className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full bg-[#25D366] py-1.5 text-xs font-semibold text-white">
                  <FaWhatsapp className="h-3.5 w-3.5" /> WhatsApp
                </span>
              </div>
            </div>

            <div
              className="rise card absolute -bottom-24 -left-3 w-52 -rotate-3 p-4"
              style={{ "--rise-index": 4 } as React.CSSProperties}
            >
              <p className="text-xs leading-relaxed text-ink-600">
                {t.home.cardQuote}
              </p>
              <p className="mt-2 text-xs font-medium text-ink-800">
                {t.home.cardQuoteBy}
              </p>
            </div>

            <div
              className="rise absolute -top-6 right-4 flex rotate-2 items-center gap-2 rounded-full border border-ink-200 bg-white py-2 pl-3 pr-4"
              style={{ "--rise-index": 5 } as React.CSSProperties}
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                <FaCheck className="h-3 w-3" />
              </span>
              <span className="text-xs font-medium text-ink-700">
                {t.home.cardAnswered}
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-2xl font-semibold tracking-tight text-ink-900">
            {t.home.catHeading}
          </h2>
          <Link
            href="/providers"
            className="group inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:text-brand-800"
          >
            {t.home.viewAll}
            <FaArrowRight className="h-3 w-3 transition-transform duration-200 ease-snap group-hover:translate-x-0.5" />
          </Link>
        </div>
        <div className="mt-7 flex flex-wrap gap-2.5">
          {CATEGORIES.map((c) => (
            <Link
              key={c.slug}
              href={`/providers?category=${c.slug}`}
              className="inline-flex items-center gap-2 rounded-full border border-ink-200 bg-white px-4 py-2.5 text-sm font-medium text-ink-700 transition-[border-color,background-color,color,transform] duration-200 ease-snap hover:border-brand-400 hover:bg-brand-50 hover:text-brand-800 active:scale-[0.97]"
            >
              <c.icon className="h-4 w-4 text-brand-600" />
              {categoryLabelLoc(c.slug, locale)}
            </Link>
          ))}
        </div>
      </section>

      {featured.length > 0 && (
        <section className="border-y border-ink-200 bg-white">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight text-ink-900">
                  {t.home.featuredHeading}
                </h2>
                <p className="mt-1 text-ink-600">{t.home.featuredSub}</p>
              </div>
            </div>
            <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {featured.map((p, i) => (
                <div
                  key={p.id}
                  className="rise"
                  style={{ "--rise-index": i } as React.CSSProperties}
                >
                  <ProviderCard p={p} locale={locale} />
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="mx-auto grid max-w-6xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[0.8fr_1.2fr]">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-ink-900 sm:text-3xl">
            {t.home.trustHeading}
          </h2>
          <p className="mt-4 max-w-[52ch] leading-relaxed text-ink-600">
            {t.home.trustBody}
          </p>
          <Link href="/providers" className="btn-primary mt-7">
            {t.home.trustCta}
          </Link>
        </div>
        <ol className="divide-y divide-ink-200 border-t border-ink-200">
          {t.home.steps.map((s, i) => (
            <li key={s.title} className="flex gap-5 py-6">
              <span className="mt-0.5 text-sm font-semibold tabular-nums text-brand-600">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div>
                <h3 className="font-semibold text-ink-900">{s.title}</h3>
                <p className="mt-1.5 max-w-[60ch] text-sm leading-relaxed text-ink-600">
                  {s.body}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="bg-brand-700">
        <div className="mx-auto grid max-w-6xl items-center gap-8 px-4 py-16 sm:px-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight text-white">
              {t.home.ctaHeading}
            </h2>
            <p className="mt-3 max-w-[55ch] leading-relaxed text-brand-100">
              {t.home.ctaBody}
            </p>
          </div>
          <div className="flex flex-wrap gap-3 lg:justify-end">
            <Link
              href="/register/provider"
              className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-brand-800 transition-[background-color,transform] duration-200 ease-snap hover:bg-brand-50 active:scale-[0.97]"
            >
              {t.home.ctaCreate}
            </Link>
            <Link
              href="/providers"
              className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-full border border-brand-400 px-6 py-3 text-sm font-semibold text-white transition-[border-color,background-color,transform] duration-200 ease-snap hover:border-brand-300 hover:bg-brand-600 active:scale-[0.97]"
            >
              {t.home.ctaSee}
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
