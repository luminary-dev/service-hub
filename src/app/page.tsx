import type { Metadata } from "next";
import Link from "next/link";
import { FaArrowRight } from "react-icons/fa6";
import { apiJson } from "@/lib/api";
import { CATEGORIES, DISTRICTS } from "@/lib/constants";
import { dict, categoryLabelLoc, districtLabelLoc } from "@/lib/i18n";
import { languageAlternates, localizedHref } from "@/lib/links";
import { getLocale, getUrlLocale } from "@/lib/locale";
import { getSession } from "@/lib/auth";
import ProviderCard, { ProviderCardDTO } from "@/components/ProviderCard";
import SearchBar from "@/components/SearchBar";

// hreflang pair (#67): en at the root, si at /si, each its own canonical.
export async function generateMetadata(): Promise<Metadata> {
  return { alternates: languageAlternates("/", await getUrlLocale()) };
}

// Districts paired with the dateline ticker's rolling trade names (decorative).
const TICKER_DISTRICTS = [
  "Colombo",
  "Kandy",
  "Galle",
  "Jaffna",
  "Gampaha",
  "Kurunegala",
  "Matara",
  "Ampara",
];

// Mono kicker: "Nº 0X ——— label". The house style for every section head.
function Kicker({ n, children }: { n: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 font-mono text-[11px] font-semibold uppercase tracking-[0.14em]">
      <span className="text-brand-700">Nº&nbsp;{n}</span>
      <span className="h-px w-8 bg-brand-300" />
      <span className="text-ink-500">{children}</span>
    </div>
  );
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

  const tickerItems = CATEGORIES.slice(0, 8).map(
    (c, i) =>
      `${categoryLabelLoc(c.slug, locale)} · ${districtLabelLoc(
        DISTRICTS.find((d) => d === TICKER_DISTRICTS[i]) ?? "Colombo",
        locale
      )}`
  );

  return (
    <div>
      {/* ── MASTHEAD / DATELINE ──────────────────────────────────────── */}
      <div className="border-b border-ink-300 bg-ink-50">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-500 sm:px-6">
          <span className="hidden font-bold text-ink-800 sm:inline">
            Baas.lk
          </span>
          <span className="hidden text-ink-300 sm:inline">/</span>
          <div className="flex-1 overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_5%,#000_95%,transparent)] [-webkit-mask-image:linear-gradient(90deg,transparent,#000_5%,#000_95%,transparent)]">
            <div className="ticker-track flex w-max gap-8">
              {[...tickerItems, ...tickerItems].map((it, i) => (
                <span key={i} className="whitespace-nowrap">
                  {it}
                </span>
              ))}
            </div>
          </div>
          <span className="inline-flex flex-shrink-0 items-center gap-1.5 font-semibold text-brand-700">
            <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-brand-600" />
            Live
          </span>
        </div>
      </div>

      {/* ── HERO ─────────────────────────────────────────────────────── */}
      <section className="border-b border-ink-300 bg-surface">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="grid lg:grid-cols-[1.4fr_1px_0.85fr] lg:gap-12">
            {/* Headline column */}
            <div className="py-14 lg:py-20">
              <Kicker n="01">{t.nav.find}</Kicker>
              <h1 className="mt-7 font-serif text-[3rem] font-semibold leading-[0.96] tracking-[-0.02em] text-ink-900 sm:text-[4.4rem]">
                {t.home.heroTitle1}
                <span className="squiggle italic text-brand-700">
                  {t.home.heroTitle2}
                </span>
              </h1>
              <p className="dropcap mt-8 max-w-[46ch] text-lg leading-relaxed text-ink-700">
                {t.home.heroSub}
              </p>

              <div className="mt-9 max-w-xl rounded-2xl border-2 border-dashed border-ink-300 bg-ink-50/60 p-4">
                <div className="eyebrow mb-3 !text-ink-500">
                  {t.home.catHeading}
                </div>
                <SearchBar />
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-mono uppercase tracking-wider text-ink-400">
                    {t.home.popular}
                  </span>
                  {t.home.popularChips.map(([label, q]) => (
                    <Link
                      key={q}
                      href={localizedHref(
                        `/providers?q=${encodeURIComponent(q)}`,
                        locale
                      )}
                      className="rounded-full border border-ink-300 bg-surface px-3 py-1 font-medium text-ink-600 transition-[border-color,color] duration-200 ease-snap hover:border-brand-400 hover:text-brand-700"
                    >
                      {label}
                    </Link>
                  ))}
                </div>
              </div>

              <p className="mt-7 font-mono text-sm text-ink-500">
                {t.home.statsLine(providerCount, CATEGORIES.length, reviewCount)}
              </p>
            </div>

            {/* Column rule */}
            <div className="hidden bg-ink-200 lg:block" aria-hidden />

            {/* Editorial collage */}
            <div
              className="relative hidden py-20 lg:block"
              aria-hidden
            >
              <div className="relative mx-auto h-full min-h-[420px] w-full max-w-[300px]">
                {/* Work-photo clipping, tilted */}
                <div className="absolute left-2 top-2 w-56 -rotate-3">
                  <div className="absolute -top-2 left-1/2 h-5 w-20 -translate-x-1/2 rotate-2 bg-brand-200/70" />
                  <div className="border border-ink-200 bg-surface p-2.5 shadow-[0_12px_30px_rgba(34,29,24,0.12)]">
                    <div className="h-36 bg-[repeating-linear-gradient(45deg,#F1E7DC,#F1E7DC_11px,#ECDFD1_11px,#ECDFD1_22px)]" />
                    <div className="mt-2 flex items-center justify-between">
                      <span className="font-mono text-[10px] uppercase tracking-wider text-ink-400">
                        Fig. 01
                      </span>
                      <span className="font-serif text-sm italic text-ink-700">
                        {categoryLabelLoc("carpenter", locale)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Pull-quote clipping */}
                <div className="absolute -right-1 top-40 w-52 rotate-2">
                  <div className="absolute -top-2 left-6 h-5 w-16 -rotate-3 bg-ink-300/70" />
                  <div className="border border-ink-200 bg-brand-50 p-4 shadow-[0_12px_30px_rgba(34,29,24,0.12)]">
                    <div className="font-serif text-3xl leading-none text-brand-400">
                      &ldquo;
                    </div>
                    <p className="-mt-2 font-serif text-[15px] italic leading-snug text-ink-800">
                      {t.home.cardQuote}
                    </p>
                    <p className="mt-2 font-mono text-[10px] uppercase tracking-wider text-brand-700">
                      {t.home.cardQuoteBy}
                    </p>
                  </div>
                </div>

                {/* Stat stamp */}
                <div className="floaty absolute -bottom-2 left-0 flex h-24 w-24 -rotate-6 flex-col items-center justify-center rounded-full border-2 border-dashed border-brand-400 bg-surface text-center">
                  <span className="font-serif text-2xl font-bold leading-none text-brand-700">
                    {providerCount > 0 ? `${providerCount}+` : "New"}
                  </span>
                  <span className="mt-1 max-w-[4.5rem] font-mono text-[8px] uppercase leading-tight tracking-wider text-ink-500">
                    {t.home.viewAll}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Nº 02 — THE TRADE INDEX ──────────────────────────────────── */}
      <section className="border-b border-ink-300 bg-ink-100">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <Kicker n="02">{t.home.popular}</Kicker>
              <h2 className="mt-4 font-serif text-4xl font-semibold tracking-tight text-ink-900 sm:text-5xl">
                {t.home.catHeading}
              </h2>
            </div>
            <Link
              href={localizedHref("/providers", locale)}
              className="group inline-flex items-center gap-1.5 font-mono text-xs font-semibold uppercase tracking-wider text-brand-700 hover:text-brand-800"
            >
              {t.home.viewAll}
              <FaArrowRight className="h-3 w-3 transition-transform duration-200 ease-snap group-hover:translate-x-0.5" />
            </Link>
          </div>

          <div className="mt-10 grid border-t-2 border-ink-900 sm:grid-flow-col sm:grid-cols-2 sm:gap-x-14 sm:[grid-template-rows:repeat(8,auto)]">
            {CATEGORIES.map((c, i) => (
              <Link
                key={c.slug}
                href={localizedHref(`/providers?category=${c.slug}`, locale)}
                className="group flex items-baseline gap-4 border-b border-ink-200 py-3.5"
              >
                <span className="w-6 shrink-0 font-mono text-xs tabular-nums text-ink-400">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <c.icon className="h-4 w-4 shrink-0 -translate-y-px text-brand-600" />
                <span className="font-serif text-xl text-ink-900 transition-colors group-hover:text-brand-700">
                  {categoryLabelLoc(c.slug, locale)}
                </span>
                <span className="mx-2 mb-1 flex-1 border-b border-dotted border-ink-300" />
                <FaArrowRight className="h-3.5 w-3.5 shrink-0 -translate-x-1 text-brand-600 opacity-0 transition-all duration-200 ease-snap group-hover:translate-x-0 group-hover:opacity-100" />
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── PULL QUOTE ───────────────────────────────────────────────── */}
      <section className="bg-surface">
        <div className="mx-auto max-w-4xl px-4 py-24 text-center sm:px-6">
          <span className="mx-auto mb-6 block h-px w-16 bg-brand-400" />
          <blockquote className="font-serif text-[1.9rem] font-medium italic leading-[1.25] tracking-tight text-ink-900 sm:text-[2.6rem]">
            {t.home.cardQuote}
          </blockquote>
          <div className="mt-7 font-mono text-xs uppercase tracking-[0.2em] text-ink-500">
            {t.home.cardQuoteBy}
          </div>
        </div>
      </section>

      {/* ── Nº 03 — RECENTLY JOINED ──────────────────────────────────── */}
      {featured.length > 0 && (
        <section className="border-y border-ink-300 bg-ink-100">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
              <div>
                <Kicker n="03">{t.home.viewAll}</Kicker>
                <h2 className="mt-4 font-serif text-4xl font-semibold tracking-tight text-ink-900 sm:text-5xl">
                  {t.home.featuredHeading}
                </h2>
                <p className="mt-2 max-w-[46ch] text-ink-600">
                  {t.home.featuredSub}
                </p>
              </div>
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

      {/* ── Nº 04 — THE MANIFESTO (dark) ─────────────────────────────── */}
      <section className="bg-[#1C1813] text-[#F3EBE0]">
        <div className="mx-auto grid max-w-6xl gap-14 px-4 py-24 sm:px-6 lg:grid-cols-[0.95fr_1.05fr]">
          <div>
            <div className="flex items-center gap-3 font-mono text-[11px] font-semibold uppercase tracking-[0.14em]">
              <span className="text-[#D98A5F]">Nº&nbsp;04</span>
              <span className="h-px w-8 bg-[#6E5A49]" />
              <span className="text-[#9C8A78]">{t.home.trustCta}</span>
            </div>
            <h2 className="mt-6 font-serif text-4xl font-medium italic leading-[1.05] tracking-tight text-white sm:text-[3.4rem]">
              {t.home.trustHeading}
            </h2>
            <p className="mt-6 max-w-[52ch] leading-relaxed text-[#B7ABA0]">
              {t.home.trustBody}
            </p>
            <Link
              href={localizedHref("/providers", locale)}
              className="mt-9 inline-flex items-center justify-center gap-2 rounded-xl bg-white px-6 py-3 font-display text-sm font-semibold text-[#9A3F22] transition-transform duration-200 ease-snap hover:-translate-y-0.5"
            >
              {t.home.trustCta}
              <FaArrowRight className="h-3 w-3" />
            </Link>
          </div>

          <ol className="border-t border-[#332A22]">
            {t.home.steps.map((s, i) => (
              <li
                key={s.title}
                className="grid grid-cols-[auto_1fr] gap-6 border-b border-[#332A22] py-7"
              >
                <span className="font-serif text-5xl font-semibold leading-none text-[#5A4636]">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div>
                  <h3 className="font-serif text-xl font-semibold text-white">
                    {s.title}
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-[#B7ABA0]">
                    {s.body}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────────── */}
      <section className="bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="relative overflow-hidden rounded-[28px] bg-brand-700 px-8 py-16 dark:bg-brand-50 sm:px-14">
            <div className="grid items-center gap-8 lg:grid-cols-[1.3fr_0.7fr]">
              <div>
                <h2 className="max-w-[18ch] font-serif text-4xl font-semibold italic leading-[1.05] tracking-tight text-white sm:text-5xl">
                  {t.home.ctaHeading}
                </h2>
                <p className="mt-4 max-w-[52ch] leading-relaxed text-brand-100 dark:text-brand-900">
                  {t.home.ctaBody}
                </p>
              </div>
              <div className="relative flex flex-wrap gap-3 lg:justify-end">
                {/* hand-drawn arrow pointing at the primary CTA */}
                <svg
                  viewBox="0 0 90 64"
                  aria-hidden
                  className="absolute -left-4 -top-12 hidden h-14 w-20 text-white/60 lg:block"
                  fill="none"
                >
                  <path
                    d="M6 8c30 0 54 12 52 40"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                  />
                  <path
                    d="M44 40l14 10 4-16"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <Link
                  href="/register/provider"
                  className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-white px-6 py-3.5 font-display text-base font-bold text-brand-800 transition-transform duration-200 ease-snap hover:-translate-y-0.5 active:scale-[0.97] dark:bg-brand-700 dark:text-ink-50"
                >
                  {t.home.ctaCreate}
                </Link>
                <Link
                  href={localizedHref("/providers", locale)}
                  className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-brand-400 px-6 py-3.5 font-display text-base font-semibold text-white transition-[border-color,background-color,transform] duration-200 ease-snap hover:border-brand-300 hover:bg-brand-600 active:scale-[0.97] dark:hover:bg-white/10"
                >
                  {t.home.ctaSee}
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
