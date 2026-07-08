import { ImageResponse } from "next/og";

// Apple touch icon (#263) — iOS applies its own rounded-corner mask, so this is
// a full-bleed brand tile (safety-orange fill, white "B") rather than the
// rounded icon.svg. Brand hex matches the provider OG image / icon.svg.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#8f3a1c",
          color: "#ffffff",
          fontSize: 120,
          fontWeight: 700,
        }}
      >
        B
      </div>
    ),
    size
  );
}
