import type { MetadataRoute } from "next";
import { db } from "@/lib/db";
import { CATEGORIES } from "@/lib/constants";
import { SITE_URL } from "@/lib/site";

// Rendered on-request (queries the DB); not prerendered at build.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const providers = await db.provider.findMany({
    where: { suspended: false },
    select: { id: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
  });

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
    lastModified: p.updatedAt,
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  return [...staticPages, ...categoryPages, ...providerPages];
}
