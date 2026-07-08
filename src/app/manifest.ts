import type { MetadataRoute } from "next";
import { SITE_NAME } from "@/lib/site";

// Web app manifest (#263) — makes the site installable / add-to-home-screen.
// Colors are the light-theme brand fill and page surface (see globals.css /
// docs/DESIGN.md): a safety-orange toolbar tint on a white splash background.
// Icons reuse the existing brand mark: favicon.ico + icon.svg + apple-icon.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE_NAME} — Find trusted tradespeople in Sri Lanka`,
    short_name: SITE_NAME,
    description:
      "Hire trusted mechanics, electricians, garden designers and more across Sri Lanka. Browse profiles, real work photos and rates, and contact your baas directly.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#8f3a1c",
    icons: [
      { src: "/favicon.ico", sizes: "16x16 32x32 48x48", type: "image/x-icon" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
