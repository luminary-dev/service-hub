import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { FaArrowRight } from "@/components/icons";
import { apiJson } from "@/lib/api";
import { CATEGORIES, DISTRICTS } from "@/lib/constants";
import { dict, categoryLabelLoc, districtLabelLoc } from "@/lib/i18n";
import { languageAlternates, localizedHref } from "@/lib/links";
import { getLocale, getUrlLocale } from "@/lib/locale";
import { getSession } from "@/lib/auth";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import ProviderCard, { ProviderCardDTO } from "@/components/ProviderCard";
import SearchBar from "@/components/SearchBar";
import InView from "@/components/InView";
import JsonLd from "@/components/JsonLd";

export async function generateMetadata(): Promise<Metadata> {
  return { alternates: languageAlternates("/", await getUrlLocale()) };
}

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

// Mono spec marker: a coded chip + label + rule. House style for headings.
function Marker({ code, children }: { code: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 font-mono text-[11px] font-semibold uppercase tracking-[0.14em]">
      <span className="rounded-sm bg-brand-700 px-1.5 py-0.5 text-white dark:text-ink-50">
        {code}
      </span>
      <span className="text-ink-500">{children}</span>
      <span className="hidden h-px w-14 bg-ink-300 sm:block" />
    </div>
  );
}

// Site-wide structured data for the homepage (#514). The WebSite node carries a
// SearchAction so Google can surface a sitelinks searchbox that deep-links into
// our provider search (/providers?q=…). The Organization node advertises the
// brand identity. sameAs (socials) is omitted deliberately — we have no
// canonical social profiles to point at yet, and inventing them would be wrong.
const HOME_JSON_LD = [
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: SITE_URL,
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${SITE_URL}/providers?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  },
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    url: SITE_URL,
    logo: `${SITE_URL}/icon.svg`,
  },
];

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
      <JsonLd data={HOME_JSON_LD} />
      {/* -- STATUS / SPEC BAR ------------------------------------------ */}
      <div className="border-b border-ink-300 bg-ink-100">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-500 sm:px-6">
          <span className="hidden font-semibold text-ink-700 sm:inline">
            REF / BAAS.LK · LK
          </span>
          <span className="hidden text-ink-300 sm:inline">|</span>
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
            Online
          </span>
        </div>
      </div>

      {/* -- HERO ------------------------------------------------------- */}
      <section className="blueprint-grid border-b border-ink-300 bg-surface">
        <div className="mx-auto grid max-w-6xl gap-12 px-4 py-14 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:py-20">
          <div>
            <Marker code="001">{t.nav.find}</Marker>
            <h1 className="mt-6 text-4xl font-bold leading-[1.05] tracking-tight text-ink-900 sm:text-[3.4rem]">
              {t.home.heroTitle1}
              <span className="text-brand-700">{t.home.heroTitle2}</span>
            </h1>
            <p className="mt-5 max-w-[52ch] text-lg leading-relaxed text-ink-600">
              {t.home.heroSub}
            </p>

            {/* Query console */}
            <div className="tech-corners mt-8 max-w-xl border border-ink-300 bg-surface p-4">
              <div className="eyebrow mb-3 !text-ink-500">{t.home.catHeading}</div>
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
                    className="rounded-sm border border-ink-300 bg-ink-50 px-2.5 py-1 font-mono text-[11px] font-medium text-ink-600 transition-colors duration-200 ease-snap hover:border-brand-400 hover:text-brand-700"
                  >
                    {label}
                  </Link>
                ))}
              </div>
            </div>

            {/* Stat readout */}
            <p className="mt-7 flex items-center gap-2 font-mono text-sm text-ink-500">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-600" />
              {t.home.statsLine(providerCount, CATEGORIES.length, reviewCount)}
            </p>
          </div>

          {/* Worker photo, framed as a technical plate */}
          <figure className="relative">
            <div className="tech-corners relative aspect-[4/5] overflow-hidden border border-ink-300 bg-ink-100">
              <Image
                src="/images/workers/hero-worker2.jpg"
                alt={t.home.heroWorkerAlt}
                fill
                priority
                sizes="(min-width: 1024px) 460px, 100vw"
                className="kenburns object-cover object-center"
              />
              <div className="blueprint-grid pointer-events-none absolute inset-0 opacity-30 mix-blend-overlay" />
              <span className="absolute left-3 top-3 rounded-sm bg-brand-700 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-white dark:text-ink-50">
                Verified trade
              </span>
            </div>
            <figcaption className="flex items-center justify-between border border-t-0 border-ink-300 bg-ink-100 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-500">
              <span>Fig.01</span>
              <span>Certified builder · LK</span>
            </figcaption>
          </figure>
        </div>
      </section>

      {/* -- 002 - TRADE REGISTRY --------------------------------------- */}
      <section className="border-b border-ink-300 bg-ink-50">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <InView className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <Marker code="002">{t.home.popular}</Marker>
              <h2 className="mt-4 text-3xl font-bold tracking-tight text-ink-900 sm:text-4xl">
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
          </InView>
          <InView
            stagger
            className="mt-8 grid grid-cols-2 border-l border-t border-ink-200 sm:grid-cols-3 lg:grid-cols-4"
          >
            {CATEGORIES.map((c, i) => (
              <Link
                key={c.slug}
                href={localizedHref(`/providers?category=${c.slug}`, locale)}
                className="group relative flex items-center gap-3.5 overflow-hidden border-b border-r border-ink-200 bg-surface p-4 transition-colors duration-200 ease-snap hover:bg-brand-50"
              >
                {/* hover scan sheen */}
                <span className="scan-line pointer-events-none absolute inset-y-0 left-0 w-1/2 -skew-x-12 bg-gradient-to-r from-transparent via-brand-500/15 to-transparent" />
                {/* growing left accent bar */}
                <span className="absolute inset-y-0 left-0 w-[3px] origin-top scale-y-0 bg-brand-600 transition-transform duration-300 ease-snap group-hover:scale-y-100" />
                <span className="relative flex h-11 w-11 shrink-0 items-center justify-center border border-ink-300 bg-ink-50 transition-colors duration-300 group-hover:border-brand-600 group-hover:bg-brand-600">
                  <c.icon className="h-5 w-5 text-brand-700 transition-[color,transform] duration-300 ease-snap group-hover:-rotate-6 group-hover:scale-110 group-hover:text-white" />
                </span>
                <span className="relative min-w-0 flex-1">
                  <span className="block font-mono text-[10px] uppercase tracking-wider text-ink-400 transition-colors duration-300 group-hover:text-brand-600">
                    TR-{String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="block truncate font-semibold text-ink-900 transition-transform duration-300 ease-snap group-hover:translate-x-0.5 group-hover:text-brand-700">
                    {categoryLabelLoc(c.slug, locale)}
                  </span>
                </span>
                <FaArrowRight className="relative h-3.5 w-3.5 shrink-0 -translate-x-2 text-brand-600 opacity-0 transition-all duration-300 ease-snap group-hover:translate-x-0 group-hover:opacity-100" />
              </Link>
            ))}
          </InView>
        </div>
      </section>

      {/* -- FIELD BAND (photo) ----------------------------------------- */}
      <section className="relative overflow-hidden bg-[#111827] text-white">
        <Image
          src="/images/workers/hero-tea.jpg"
          alt={t.home.heroTeaAlt}
          fill
          sizes="100vw"
          className="object-cover object-center opacity-70"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#111827] via-[#111827]/90 to-[#111827]/30" />
        <div className="blueprint-grid pointer-events-none absolute inset-0 opacity-20" />
        <div className="relative mx-auto max-w-6xl px-4 py-24 sm:px-6">
          <InView className="max-w-2xl">
            <div className="flex items-center gap-2.5 font-mono text-[11px] font-semibold uppercase tracking-[0.14em]">
              <span className="rounded-sm bg-brand-600 px-1.5 py-0.5 text-white">
                003
              </span>
              <span className="text-white/60">{t.home.trustCta}</span>
            </div>
            <h2 className="mt-5 text-3xl font-bold leading-tight tracking-tight text-white sm:text-[2.75rem]">
              {t.home.trustHeading}
            </h2>
            <p className="mt-5 max-w-[54ch] leading-relaxed text-white/75">
              {t.home.trustBody}
            </p>
            <Link
              href={localizedHref("/providers", locale)}
              className="mt-8 inline-flex items-center justify-center gap-2 rounded-md bg-brand-600 px-6 py-3 font-display text-sm font-semibold text-white transition-transform duration-200 ease-snap hover:-translate-y-0.5"
            >
              {t.home.trustCta}
              <FaArrowRight className="h-3 w-3" />
            </Link>
          </InView>
        </div>
      </section>

      {/* -- 004 - RECENTLY FILED (featured) ---------------------------- */}
      {featured.length > 0 && (
        <section className="border-b border-ink-300 bg-ink-50">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <InView className="mb-8">
              <Marker code="004">{t.home.viewAll}</Marker>
              <h2 className="mt-4 text-3xl font-bold tracking-tight text-ink-900 sm:text-4xl">
                {t.home.featuredHeading}
              </h2>
              <p className="mt-2 text-ink-600">{t.home.featuredSub}</p>
            </InView>
            <InView stagger className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {featured.map((p) => (
                <ProviderCard
                  key={p.id}
                  p={p}
                  locale={locale}
                  showFavorite={!!session}
                  favorited={favoriteIds.has(p.id)}
                />
              ))}
            </InView>
          </div>
        </section>
      )}

      {/* -- 005 - PROCEDURE (how it works) ----------------------------- */}
      <section className="border-b border-ink-300 bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <InView className="mb-10">
            <Marker code="005">{t.home.trustCta}</Marker>
          </InView>
          <InView
            as="ol"
            stagger
            className="grid border-t border-ink-300 sm:grid-cols-2 lg:grid-cols-4"
          >
            {t.home.steps.map((s, i) => (
              <li
                key={s.title}
                className="border-b border-ink-200 p-6 last:border-r-0 sm:border-r"
              >
                <div className="font-mono text-3xl font-bold tabular-nums text-brand-600">
                  {String(i + 1).padStart(2, "0")}
                </div>
                <h3 className="mt-4 font-semibold text-ink-900">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-600">
                  {s.body}
                </p>
              </li>
            ))}
          </InView>
        </div>
      </section>

      {/* -- CTA -------------------------------------------------------- */}
      <section className="bg-ink-50">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <InView className="tech-corners relative overflow-hidden border border-ink-300 bg-surface">
            <div className="hazard h-2 w-full" />
            <div className="flex flex-wrap items-center justify-between gap-8 p-8 sm:p-12">
              <div>
                <h2 className="text-2xl font-bold tracking-tight text-ink-900 sm:text-3xl">
                  {t.home.ctaHeading}
                </h2>
                <p className="mt-3 max-w-[55ch] leading-relaxed text-ink-600">
                  {t.home.ctaBody}
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link href="/register/provider" className="btn-primary !px-6 !py-3">
                  {t.home.ctaCreate}
                </Link>
                <Link
                  href={localizedHref("/providers", locale)}
                  className="btn-secondary !px-6 !py-3"
                >
                  {t.home.ctaSee}
                </Link>
              </div>
            </div>
          </InView>
        </div>
      </section>
    </div>
  );
}
