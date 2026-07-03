// Canonical site origin, used for sitemap/robots absolute URLs and OG metadata.
// Override per-environment with NEXT_PUBLIC_SITE_URL.
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://service-hub-indol.vercel.app"
).replace(/\/$/, "");

export const SITE_NAME = "Baas.lk";
