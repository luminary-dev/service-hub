import type { MetadataRoute } from "next";
import { CATEGORIES } from "@/lib/constants";
import { localizedHref } from "@/lib/links";
import { SITE_URL } from "@/lib/site";

// Caching (#57): public-and-stable. Crawlers don't need a fresher-than-hourly
// sitemap, so the route is ISR with a 1-hour revalidate instead of querying
// the gateway on every hit. The build-time prerender runs without a gateway
// and serves the static entries only; the first runtime revalidation fills
// in the provider URLs.
export const revalidate = 3600;

const GATEWAY_URL = process.env.GATEWAY_URL ?? "http://localhost:4000";

// Locale-prefixed URLs (#67): every indexable page exists in English at the
// root and in Sinhala under /si. Emit both URLs, each carrying the hreflang
// alternates pair, so both language versions are crawlable.
function bilingual(
  path: string,
  entry: Omit<MetadataRoute.Sitemap[number], "url" | "alternates">,
): MetadataRoute.Sitemap {
  const en = `${SITE_URL}${localizedHref(path, "en")}`;
  const si = `${SITE_URL}${localizedHref(path, "si")}`;
  const alternates = { languages: { en, si } };
  return [
    { ...entry, url: en, alternates },
    { ...entry, url: si, alternates },
  ];
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Plain fetch (no cookies): the sitemap can render outside a user request
  // context, and the ids listing is public. If the gateway is unreachable we
  // still serve the static entries.
  let providers: { id: string; updatedAt: string }[] = [];
  try {
    const res = await fetch(`${GATEWAY_URL}/api/providers/ids`, {
      next: { revalidate: 3600 },
    });
    if (res.ok) {
      const data = (await res.json()) as {
        providers: { id: string; updatedAt: string }[];
      };
      providers = data.providers;
    }
  } catch {
    // gateway down — fall through with static entries only
  }

  const now = new Date();

  const staticPages: MetadataRoute.Sitemap = [
    ...bilingual("/", { lastModified: now, changeFrequency: "daily", priority: 1 }),
    ...bilingual("/providers", {
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.9,
    }),
    // Auth pages stay English-root only — they're session territory, not
    // localized landing pages.
    { url: `${SITE_URL}/register`, lastModified: now, changeFrequency: "monthly" },
    { url: `${SITE_URL}/login`, lastModified: now, changeFrequency: "monthly" },
  ];

  const categoryPages: MetadataRoute.Sitemap = CATEGORIES.flatMap((c) =>
    bilingual(`/providers?category=${c.slug}`, {
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.7,
    }),
  );

  const providerPages: MetadataRoute.Sitemap = providers.flatMap((p) =>
    bilingual(`/providers/${p.id}`, {
      lastModified: new Date(p.updatedAt),
      changeFrequency: "weekly",
      priority: 0.8,
    }),
  );

  return [...staticPages, ...categoryPages, ...providerPages];
}
