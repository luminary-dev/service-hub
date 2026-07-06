import type { Metadata } from "next";
import Link from "next/link";
import { FaArrowRight, FaCircleCheck } from "react-icons/fa6";
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

// Eight anchor points around the orbit ring, matching the reference layout
// (E, SE, S, SW, W, NW, N, NE at ±8% / ±20.3% / ±79.7% offsets).
const ORBIT_POS = [
  { left: "92%", top: "50%" },
  { left: "79.7%", top: "79.7%" },
  { left: "50%", top: "92%" },
  { left: "20.3%", top: "79.7%" },
  { left: "8%", top: "50%" },
  { left: "20.3%", top: "20.3%" },
  { left: "50%", top: "8%" },
  { left: "79.7%", top: "20.3%" },
] as const;
const ORBIT_DOTS = ["#C05A38", "#C0872F", "#B4653A", "#A98C3C"];
// Districts paired with the ticker's rolling trade names (decorative).
const TICKER_DISTRICTS = [
  "Colombo",
  "Kandy",
  "Galle",
  "Jaffna",
  "Gampaha",
  "Kurunegala",
  "Matara",
  "Negombo",
];

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

  const orbitCats = CATEGORIES.slice(0, 8);
  const gridCats = CATEGORIES.slice(0, 8);
  const tickerItems = orbitCats.map(
    (c, i) =>
      `${categoryLabelLoc(c.slug, locale)} · ${districtLabelLoc(
        DISTRICTS.find((d) => d === TICKER_DISTRICTS[i]) ?? "Colombo",
        locale
      )}`
  );

  return (
    <div>
      {/* ── ACTIVITY TICKER ─────────────────────────────────────────── */}
      <div className="overflow-hidden border-b border-ink-200 bg-ink-50">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-2.5 sm:px-6">
          <span className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-brand-800">
            <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-brand-600" />
            LIVE
          </span>
          <div className="flex-1 overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_6%,#000_94%,transparent)] [-webkit-mask-image:linear-gradient(90deg,transparent,#000_6%,#000_94%,transparent)]">
            <div className="ticker-track flex w-max gap-10">
              {[...tickerItems, ...tickerItems].map((it, i) => (
                <span
                  key={i}
                  className="whitespace-nowrap font-mono text-xs text-ink-500"
                >
                  {it}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── HERO ────────────────────────────────────────────────────── */}
      <section className="border-b border-ink-200 bg-surface">
        <div className="mx-auto grid max-w-6xl gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:py-20">
          <div>
            <h1 className="rise text-[2.6rem] font-bold leading-[1.03] tracking-tight text-ink-900 sm:text-[3.4rem]">
              {t.home.heroTitle1}
              <span className="text-brand-700">{t.home.heroTitle2}</span>
            </h1>
            <p
              className="rise mt-5 max-w-[54ch] text-base leading-relaxed text-ink-600 sm:text-lg"
              style={{ "--rise-index": 1 } as React.CSSProperties}
            >
              {t.home.heroSub}
            </p>

            <div
              className="rise mt-8 max-w-xl rounded-3xl border border-ink-200 bg-surface p-4 shadow-[0_10px_30px_rgba(34,29,24,0.06)]"
              style={{ "--rise-index": 2 } as React.CSSProperties}
            >
              <div className="eyebrow mb-3 !text-ink-500">
                {t.home.catHeading}
              </div>
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

            <p
              className="rise mt-6 font-mono text-sm text-ink-500"
              style={{ "--rise-index": 3 } as React.CSSProperties}
            >
              {t.home.statsLine(providerCount, CATEGORIES.length, reviewCount)}
            </p>
          </div>

          {/* Orbiting hub */}
          <div
            className="relative mx-auto hidden aspect-square w-full max-w-[520px] lg:block"
            aria-hidden
          >
            <div className="absolute -inset-[6%] bg-[radial-gradient(circle_at_50%_50%,rgba(192,90,56,0.16),rgba(192,90,56,0)_62%)]" />
            <div className="absolute left-1/2 top-1/2 h-full w-full -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-ink-300" />
            <div className="absolute left-1/2 top-1/2 h-[66%] w-[66%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-ink-200" />

            <div className="orbit-ring absolute inset-0">
              {orbitCats.map((c, i) => (
                <div
                  key={c.slug}
                  className="absolute -translate-x-1/2 -translate-y-1/2"
                  style={ORBIT_POS[i]}
                >
                  <div className="orbit-chip flex items-center gap-2 rounded-full border border-ink-200 bg-surface px-3 py-2 shadow-[0_8px_20px_rgba(34,29,24,0.08)]">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
                      style={{
                        background: ORBIT_DOTS[i % ORBIT_DOTS.length],
                      }}
                    />
                    <span className="whitespace-nowrap font-display text-[13.5px] font-semibold text-ink-900">
                      {categoryLabelLoc(c.slug, locale)}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="floaty absolute left-1/2 top-1/2 z-[3] w-48 -translate-x-1/2 -translate-y-1/2 rounded-[22px] bg-[#1C1813] px-6 py-6 text-center text-white shadow-[0_24px_50px_rgba(34,29,24,0.24)]">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-brand-700 font-display text-xl font-bold text-white">
                B
              </div>
              <div className="mt-3 font-display text-[27px] font-bold leading-none tracking-tight">
                {providerCount > 0 ? `${providerCount}+` : "New"}
              </div>
              <div className="mt-1 text-[12.5px] text-[#C9B8A6]">
                {t.home.viewAll}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── BROWSE BY TRADE ─────────────────────────────────────────── */}
      <section className="border-b border-ink-200 bg-ink-100">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="eyebrow">{t.home.popular}</div>
              <h2 className="mt-2 text-3xl font-bold tracking-tight text-ink-900">
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
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {gridCats.map((c, i) => (
              <Link
                key={c.slug}
                href={localizedHref(`/providers?category=${c.slug}`, locale)}
                className="group flex flex-col gap-3.5 rounded-2xl border border-ink-200 bg-surface p-5 shadow-[0_1px_2px_rgba(34,29,24,0.05)] transition-[transform,box-shadow] duration-200 ease-snap hover:-translate-y-1 hover:shadow-[0_12px_28px_rgba(34,29,24,0.09)]"
              >
                <span
                  className="flex h-10 w-10 items-center justify-center rounded-xl"
                  style={{
                    background:
                      i % 2 === 0 ? "var(--color-brand-50)" : "#EDE3C9",
                  }}
                >
                  <c.icon className="h-4.5 w-4.5 text-brand-700" />
                </span>
                <span className="font-display text-base font-semibold text-ink-900">
                  {categoryLabelLoc(c.slug, locale)}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURED PROS ───────────────────────────────────────────── */}
      {featured.length > 0 && (
        <section className="border-b border-ink-200 bg-surface">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="eyebrow">{t.home.viewAll}</div>
                <h2 className="mt-2 text-3xl font-bold tracking-tight text-ink-900">
                  {t.home.featuredHeading}
                </h2>
                <p className="mt-1 text-ink-600">{t.home.featuredSub}</p>
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

      {/* ── TRUST / HOW IT WORKS (dark band) ─────────────────────────── */}
      <section className="bg-[#1C1813] text-[#F3EBE0]">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="max-w-2xl">
            <div className="font-mono text-xs font-semibold uppercase tracking-[0.08em] text-[#D98A5F]">
              {t.home.trustCta}
            </div>
            <h2 className="mt-3 text-4xl font-bold leading-[1.1] tracking-tight text-white">
              {t.home.trustHeading}
            </h2>
            <p className="mt-4 max-w-[60ch] leading-relaxed text-[#B7ABA0]">
              {t.home.trustBody}
            </p>
          </div>
          <ol className="mt-12 grid gap-px overflow-hidden rounded-[18px] border border-[#332A22] bg-[#332A22] sm:grid-cols-2 lg:grid-cols-4">
            {t.home.steps.map((s, i) => (
              <li key={s.title} className="bg-[#211B15] p-7">
                <div className="font-mono text-sm font-bold text-[#D98A5F]">
                  {String(i + 1).padStart(2, "0")}
                </div>
                <h3 className="mt-4 flex items-start gap-2 font-display text-lg font-semibold text-white">
                  <FaCircleCheck className="mt-1 h-4 w-4 shrink-0 text-[#D98A5F]" />
                  {s.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-[#B7ABA0]">
                  {s.body}
                </p>
              </li>
            ))}
          </ol>
          <Link
            href={localizedHref("/providers", locale)}
            className="mt-10 inline-flex items-center justify-center gap-2 rounded-xl bg-white px-6 py-3 font-display text-sm font-semibold text-[#9A3F22] transition-transform duration-200 ease-snap hover:-translate-y-0.5"
          >
            {t.home.trustCta}
            <FaArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </section>

      {/* ── CTA (terracotta) ────────────────────────────────────────── */}
      <section className="bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-8 rounded-[28px] bg-brand-700 px-10 py-14 dark:bg-brand-50">
            <div>
              <h2 className="text-3xl font-bold tracking-tight text-white">
                {t.home.ctaHeading}
              </h2>
              <p className="mt-3 max-w-[55ch] leading-relaxed text-brand-100 dark:text-brand-900">
                {t.home.ctaBody}
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
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
      </section>
    </div>
  );
}
