import type { MetadataRoute } from "next";
import { CATEGORIES } from "@/lib/constants";
import { SITE_URL } from "@/lib/site";

// Caching (#57): public-and-stable. Crawlers don't need a fresher-than-hourly
// sitemap, so the route is ISR with a 1-hour revalidate instead of querying
// the gateway on every hit. The build-time prerender runs without a gateway
// and serves the static entries only; the first runtime revalidation fills
// in the provider URLs.
export const revalidate = 3600;

const GATEWAY_URL = process.env.GATEWAY_URL ?? "http://localhost:4000";

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
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: "daily", priority: 1 },
    {
      url: `${SITE_URL}/providers`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.9,
    },
    { url: `${SITE_URL}/register`, lastModified: now, changeFrequency: "monthly" },
    { url: `${SITE_URL}/login`, lastModified: now, changeFrequency: "monthly" },
  ];

  const categoryPages: MetadataRoute.Sitemap = CATEGORIES.map((c) => ({
    url: `${SITE_URL}/providers?category=${c.slug}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  const providerPages: MetadataRoute.Sitemap = providers.map((p) => ({
    url: `${SITE_URL}/providers/${p.id}`,
    lastModified: new Date(p.updatedAt),
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  return [...staticPages, ...categoryPages, ...providerPages];
}
