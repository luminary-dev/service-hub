import type { MetadataRoute } from "next";
import { fetchCategoryOptions } from "@/lib/categories-server";
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

  // Admin-managed categories (#561): emit the active list so new categories
  // get crawled and deactivated ones drop out. Degrades to the static
  // constants inside fetchCategoryOptions when the gateway is unreachable
  // (e.g. the build-time prerender).
  const categories = await fetchCategoryOptions({ revalidate: 3600 });

  const now = new Date();

  const staticPages: MetadataRoute.Sitemap = [
    ...bilingual("/", { lastModified: now, changeFrequency: "daily", priority: 1 }),
    ...bilingual("/providers", {
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.9,
    }),
    // Auth routes (/login, /register) are deliberately omitted: they're
    // session/utility pages carrying only the generic default title and
    // description, so listing them dilutes crawl focus without adding any
    // indexable value.
    ...bilingual("/terms", {
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3,
    }),
    ...bilingual("/privacy", {
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3,
    }),
  ];

  const categoryPages: MetadataRoute.Sitemap = categories.flatMap((c) =>
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
