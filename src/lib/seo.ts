import {
  dict,
  bilingualText,
  categoryLabelLoc,
  districtLabelLoc,
  type Locale,
} from "./i18n";
import { localizedHref } from "./links";
import { SITE_NAME, SITE_URL } from "./site";

// Open Graph locale tag for the URL being served. Derived from the URL locale
// (not the cookie-influenced viewer locale) so it always agrees with the
// canonical / hreflang URLs (#379).
export function ogLocale(urlLocale: Locale): string {
  return urlLocale === "si" ? "si_LK" : "en_US";
}

// The site-default Open Graph block. Next shallow-merges metadata across
// segments — a page that defines `openGraph` replaces the root layout's
// wholesale — so pages that need a per-page og:url spread this and override.
// `locale` drives the human-readable text (matches the rendered page);
// `urlLocale` drives og:locale and og:url. When `path` (unprefixed) is given,
// og:url is the same localized path used for the canonical, resolved absolute
// by metadataBase; without it no og:url is emitted (#379).
export function siteOpenGraph(locale: Locale, urlLocale: Locale, path?: string) {
  const m = dict[locale].meta;
  return {
    title: m.title,
    description: m.description,
    siteName: SITE_NAME,
    type: "website" as const,
    locale: ogLocale(urlLocale),
    ...(path !== undefined && { url: localizedHref(path, urlLocale) }),
  };
}

export type ProviderJsonLdInput = {
  id: string;
  name: string;
  category: string;
  headline: string;
  headlineSi?: string | null;
  district: string;
  city: string;
  avatarUrl: string | null;
  rating: number | null;
  reviewCount: number;
};

// LocalBusiness JSON-LD for a provider profile (#379). Bilingual-aware: text
// follows the rendered locale (Sinhala headline/labels under /si with English
// fallback, like the page body) while @id stays pinned to the English
// canonical so both language pages describe one entity. AggregateRating is
// only emitted when reviews exist — Google rejects zero-count ratings.
export function providerJsonLd(
  p: ProviderJsonLdInput,
  locale: Locale,
  urlLocale: Locale,
) {
  const path = `/providers/${encodeURIComponent(p.id)}`;
  const image =
    p.avatarUrl &&
    (/^https?:\/\//.test(p.avatarUrl) ? p.avatarUrl : `${SITE_URL}${p.avatarUrl}`);
  return {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "@id": `${SITE_URL}${path}`,
    name: p.name,
    description: bilingualText(p.headline, p.headlineSi, locale),
    url: `${SITE_URL}${localizedHref(path, urlLocale)}`,
    ...(image && { image }),
    address: {
      "@type": "PostalAddress",
      addressLocality: p.city,
      addressRegion: districtLabelLoc(p.district, locale),
      addressCountry: "LK",
    },
    knowsAbout: categoryLabelLoc(p.category, locale),
    ...(p.rating !== null &&
      p.reviewCount > 0 && {
        aggregateRating: {
          "@type": "AggregateRating",
          ratingValue: Number(p.rating.toFixed(1)),
          reviewCount: p.reviewCount,
          bestRating: 5,
          worstRating: 1,
        },
      }),
  };
}
