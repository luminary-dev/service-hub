import type { NextConfig } from "next";

// CSP directives — ENFORCED (promoted from Report-Only, #112). The app pulls
// in no third-party origins today, so everything is 'self' except:
// - script-src keeps 'unsafe-inline' because Next injects inline runtime/
//   hydration scripts without a nonce when self-hosted; enforcing without it
//   blanks the page. This is the minimal loosening required — migrating to a
//   per-request nonce + 'strict-dynamic' is the follow-up hardening.
// - script-src additionally allows 'unsafe-eval' IN DEVELOPMENT ONLY: Turbopack
//   and React dev tooling use eval() for HMR and callstack reconstruction.
//   Production builds never include it.
// - style-src keeps 'unsafe-inline' for Tailwind, next/font, and the inline
//   style attributes used for gradients / --rise-index vars.
// - img-src allows the Vercel Blob host (work photos/avatars served directly
//   to the browser for unoptimized/SVG cases) plus data:/blob: (upload
//   previews). Uploads served via /api/files/* are same-origin ('self').
// No Report-Only copy is kept: we never had report-uri/report-to collection
// infrastructure, so a shadow header would report to nowhere.
const isDev = process.env.NODE_ENV !== "production";

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
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
  { key: "Content-Security-Policy", value: csp },
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
  // /api/* is proxied to the API gateway at request time by src/proxy.ts
  // (a config-level rewrites() entry would bake GATEWAY_URL into the build,
  // see #106). Server components fetch the gateway directly via
  // src/lib/api.ts.
};

export default nextConfig;
