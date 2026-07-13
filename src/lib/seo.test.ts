import { describe, expect, it } from "vitest";
import { ogLocale, providerJsonLd, siteOpenGraph } from "./seo";
import { languageAlternates } from "./links";
import { SITE_NAME, SITE_URL } from "./site";
import { categoryLabelLoc, dict } from "./i18n";

describe("ogLocale", () => {
  it("maps the URL locale to an Open Graph locale tag", () => {
    expect(ogLocale("en")).toBe("en_US");
    expect(ogLocale("si")).toBe("si_LK");
  });
});

describe("siteOpenGraph", () => {
  it("emits an og:url matching the canonical for the English root", () => {
    const og = siteOpenGraph("en", "en", "/providers");
    expect(og.url).toBe("/providers");
    expect(og.url).toBe(languageAlternates("/providers", "en")!.canonical);
    expect(og.locale).toBe("en_US");
    expect(og.siteName).toBe(SITE_NAME);
    expect(og.type).toBe("website");
    expect(og.title).toBe(dict.en.meta.title);
  });

  it("emits the /si og:url and si_LK locale for Sinhala URLs", () => {
    const og = siteOpenGraph("si", "si", "/providers");
    expect(og.url).toBe("/si/providers");
    expect(og.url).toBe(languageAlternates("/providers", "si")!.canonical);
    expect(og.locale).toBe("si_LK");
    expect(og.title).toBe(dict.si.meta.title);
  });

  it("keeps query strings in og:url, matching the category canonicals", () => {
    expect(siteOpenGraph("en", "en", "/providers?category=plumber").url).toBe(
      "/providers?category=plumber",
    );
    expect(siteOpenGraph("si", "si", "/providers?category=plumber").url).toBe(
      "/si/providers?category=plumber",
    );
  });

  it("omits og:url entirely when no path is given (root layout)", () => {
    expect(siteOpenGraph("en", "en")).not.toHaveProperty("url");
  });

  it("splits text locale from URL locale (cookie-si viewer on an en URL)", () => {
    const og = siteOpenGraph("si", "en", "/");
    expect(og.title).toBe(dict.si.meta.title);
    expect(og.locale).toBe("en_US");
    expect(og.url).toBe("/");
  });
});

describe("providerJsonLd", () => {
  const base = {
    id: "prov-1",
    name: "Sunil Perera",
    category: "plumber",
    headline: "Reliable plumbing",
    headlineSi: "විශ්වාසදායක නල කර්මාන්ත",
    district: "Colombo",
    city: "Dehiwala",
    avatarUrl: "/api/files/avatars/a.jpg",
    rating: 4.4333,
    reviewCount: 12,
  };

  it("builds a LocalBusiness node with absolute URLs", () => {
    const node = providerJsonLd(base, "en", "en");
    expect(node["@context"]).toBe("https://schema.org");
    expect(node["@type"]).toBe("LocalBusiness");
    expect(node["@id"]).toBe(`${SITE_URL}/providers/prov-1`);
    expect(node.url).toBe(`${SITE_URL}/providers/prov-1`);
    expect(node.name).toBe("Sunil Perera");
    expect(node.description).toBe("Reliable plumbing");
    expect(node.image).toBe(`${SITE_URL}/api/files/avatars/a.jpg`);
    expect(node.address).toEqual({
      "@type": "PostalAddress",
      addressLocality: "Dehiwala",
      addressRegion: "Colombo",
      addressCountry: "LK",
    });
    expect(node.knowsAbout).toBe("Plumber");
  });

  it("rounds the aggregate rating to one decimal, like the UI", () => {
    const node = providerJsonLd(base, "en", "en");
    expect(node.aggregateRating).toEqual({
      "@type": "AggregateRating",
      ratingValue: 4.4,
      reviewCount: 12,
      bestRating: 5,
      worstRating: 1,
    });
  });

  it("omits aggregateRating when there are no reviews", () => {
    expect(
      providerJsonLd({ ...base, rating: null, reviewCount: 0 }, "en", "en"),
    ).not.toHaveProperty("aggregateRating");
  });

  it("is bilingual under /si: Sinhala text, /si url, English @id", () => {
    const node = providerJsonLd(base, "si", "si");
    expect(node.description).toBe("විශ්වාසදායක නල කර්මාන්ත");
    expect(node.url).toBe(`${SITE_URL}/si/providers/prov-1`);
    // Both language pages describe one entity.
    expect(node["@id"]).toBe(`${SITE_URL}/providers/prov-1`);
    expect(node.knowsAbout).toBe(categoryLabelLoc("plumber", "si"));
  });

  it("falls back to the English headline when no Sinhala variant exists", () => {
    const node = providerJsonLd({ ...base, headlineSi: null }, "si", "si");
    expect(node.description).toBe("Reliable plumbing");
  });

  it("keeps already-absolute avatar URLs and omits image when absent", () => {
    expect(
      providerJsonLd(
        { ...base, avatarUrl: "https://lh3.example.com/photo.jpg" },
        "en",
        "en",
      ).image,
    ).toBe("https://lh3.example.com/photo.jpg");
    expect(
      providerJsonLd({ ...base, avatarUrl: null }, "en", "en"),
    ).not.toHaveProperty("image");
  });
});
