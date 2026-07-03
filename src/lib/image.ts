// Seed placeholder images are SVG. The Next image optimizer rejects SVG by
// default (for security), so we serve those unoptimized and let it optimize the
// real raster uploads (JPEG/PNG/WebP) normally.
export function isSvg(url: string) {
  return url.toLowerCase().split("?")[0].endsWith(".svg");
}
