import { ImageResponse } from "next/og";
import { db } from "@/lib/db";
import { categoryLabelLoc } from "@/lib/i18n";
import { SITE_NAME } from "@/lib/site";

export const dynamic = "force-dynamic";
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
  const provider = await db.provider.findUnique({
    where: { id },
    select: {
      category: true,
      city: true,
      district: true,
      suspended: true,
      user: { select: { name: true } },
      reviews: { select: { rating: true } },
    },
  });

  const brand = "#8f3a1c";
  const ink = "#1c1917";
  const live = provider && !provider.suspended;

  const name = live ? provider.user.name : SITE_NAME;
  const category = live
    ? categoryLabelLoc(provider.category, "en")
    : "Trusted tradespeople in Sri Lanka";
  const location = live ? `${provider.city}, ${provider.district}` : "";
  const reviews = provider?.reviews ?? [];
  const avg = reviews.length
    ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1)
    : null;
  const footer = avg
    ? `Rated ${avg} out of 5 (${reviews.length} review${reviews.length === 1 ? "" : "s"})`
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
