import type { NextConfig } from "next";

// CSP directives. Kept Report-Only for now (see headers() below) so we can
// observe violations before enforcing.
// - script-src allows 'unsafe-inline' because Next injects inline hydration
//   scripts; tightening this to a nonce + 'strict-dynamic' is the follow-up
//   before switching from Report-Only to enforcing.
// - style-src needs 'unsafe-inline' for Tailwind, next/font, and the inline
//   style attributes used for gradients / --rise-index vars.
// - img-src allows the Vercel Blob host (work photos/avatars served directly
//   to the browser for unoptimized/SVG cases) plus data:/blob:.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.public.blob.vercel-storage.com",
  "font-src 'self'",
  "connect-src 'self' https://*.public.blob.vercel-storage.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy-Report-Only", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
];

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      // Vercel Blob public store (work photos & avatars in production)
      {
        protocol: "https",
        hostname: "**.public.blob.vercel-storage.com",
      },
    ],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // All /api/* traffic (client components use relative URLs) is proxied to
  // the API gateway; server components fetch it directly via src/lib/api.ts.
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.GATEWAY_URL ?? "http://localhost:4000"}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
