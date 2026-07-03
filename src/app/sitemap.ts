import type { MetadataRoute } from "next";
import { CATEGORIES } from "@/lib/constants";
import { SITE_URL } from "@/lib/site";

// Rendered on-request (queries the gateway); not prerendered at build.
export const dynamic = "force-dynamic";

const GATEWAY_URL = process.env.GATEWAY_URL ?? "http://localhost:4000";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Plain fetch (no cookies): the sitemap can render outside a user request
  // context, and the ids listing is public. If the gateway is unreachable we
  // still serve the static entries.
  let providers: { id: string; updatedAt: string }[] = [];
  try {
    const res = await fetch(`${GATEWAY_URL}/api/providers/ids`, {
      cache: "no-store",
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
