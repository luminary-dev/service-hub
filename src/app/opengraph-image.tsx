import { ImageResponse } from "next/og";
import { SITE_NAME } from "@/lib/site";

// Default OpenGraph / Twitter image (#264) — the fallback social card for every
// page without its own (home, /providers, category pages). Provider detail
// pages ship their own opengraph-image and override this.
//
// Mirrors the provider OG image: 1200×630, brand/ink hex matching icon.svg,
// English copy only (next/og's Satori ships a Latin font, so Sinhala glyphs
// don't render), and an explicit display on every multi-child element.
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = `${SITE_NAME} — Find trusted tradespeople in Sri Lanka`;

export default function Image() {
  const brand = "#8f3a1c";
  const ink = "#1c1917";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#ffffff",
          padding: "72px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "56px",
              height: "56px",
              borderRadius: "14px",
              background: brand,
              color: "#ffffff",
              fontSize: "34px",
              fontWeight: 700,
            }}
          >
            B
          </div>
          <div style={{ display: "flex", fontSize: "34px", fontWeight: 700, color: brand }}>
            {SITE_NAME}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
          <div style={{ display: "flex", fontSize: "80px", fontWeight: 700, color: ink, lineHeight: 1.05 }}>
            Find trusted tradespeople in Sri Lanka
          </div>
          <div style={{ display: "flex", fontSize: "38px", fontWeight: 600, color: brand }}>
            Mechanics, electricians, garden designers and more
          </div>
        </div>

        <div style={{ display: "flex", fontSize: "32px", color: "#44403c" }}>
          Browse profiles, real work photos and reviews — contact your baas directly.
        </div>
      </div>
    ),
    size
  );
}
