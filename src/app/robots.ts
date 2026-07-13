import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Keep private / authenticated areas out of the index — including
      // their Sinhala URL space: /si/* are real crawlable URLs served via
      // the proxy rewrite, so they need their own rules (#379).
      disallow: [
        "/dashboard",
        "/admin",
        "/account",
        "/api/",
        "/si/dashboard",
        "/si/admin",
        "/si/account",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
