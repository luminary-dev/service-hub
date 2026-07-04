import { ImageResponse } from "next/og";
import { apiJson } from "@/lib/api";
import { categoryLabelLoc } from "@/lib/i18n";
import { SITE_NAME } from "@/lib/site";

// OG-image payload as served by `GET /api/providers/:id/card` on the gateway.
type ProviderCard = {
  name: string;
  category: string;
  city: string;
  district: string;
  suspended: boolean;
  rating: number | null;
  reviewCount: number;
};

// Caching (#57): public-and-stable. OG images are fetched by link scrapers;
// a rating/name that is up to 5 minutes stale is harmless, so the card
// payload comes from the Data Cache (cookie-less fetch below) instead of
// hitting the gateway on every scrape.
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Baas.lk provider";

// next/og (Satori) only ships a Latin font, so we use English category labels
// here (no Sinhala glyphs), avoid special glyphs that trigger remote font
// fetches, and give every multi-child element an explicit display.
export default async function Image({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const provider = await apiJson<ProviderCard>(
    `/api/providers/${encodeURIComponent(id)}/card`,
    { revalidate: 300 }
  );

  const brand = "#8f3a1c";
  const ink = "#1c1917";
  const live = provider && !provider.suspended;

  const name = live ? provider.name : SITE_NAME;
  const category = live
    ? categoryLabelLoc(provider.category, "en")
    : "Trusted tradespeople in Sri Lanka";
  const location = live ? `${provider.city}, ${provider.district}` : "";
  const reviewCount = provider?.reviewCount ?? 0;
  const avg =
    provider?.rating != null && reviewCount > 0
      ? provider.rating.toFixed(1)
      : null;
  const footer = avg
    ? `Rated ${avg} out of 5 (${reviewCount} review${reviewCount === 1 ? "" : "s"})`
    : "Verified local professionals";

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
            Baas.lk
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <div style={{ display: "flex", fontSize: "76px", fontWeight: 700, color: ink }}>
            {name}
          </div>
          <div style={{ display: "flex", fontSize: "42px", fontWeight: 600, color: brand }}>
            {category}
          </div>
          {location ? (
            <div style={{ display: "flex", fontSize: "30px", color: "#57534e" }}>
              {location}
            </div>
          ) : null}
        </div>

        <div style={{ display: "flex", fontSize: "32px", color: "#44403c" }}>
          {footer}
        </div>
      </div>
    ),
    size
  );
}
