import type { NextConfig } from "next";

// Security headers. Content-Security-Policy is NOT here — it moved to
// src/proxy.ts (#770) so it can carry a fresh per-request nonce.
//
// CSP background — ENFORCED (promoted from Report-Only, #112). The app pulls in
// no third-party origins today, so everything is 'self'. The per-request
// nonce + 'strict-dynamic' migration is now DONE: production script-src is
// `'self' 'nonce-<value>' 'strict-dynamic'` (no 'unsafe-inline'), generated
// and emitted in src/proxy.ts. That's the one directive that needs a runtime
// value, which a build-time next.config header can't provide — the rest of the
// CSP (style-src 'unsafe-inline' for Tailwind/next/font/inline style vars;
// img-src for R2/OSM tiles #48; Turnstile #633 when NEXT_PUBLIC_TURNSTILE_SITE_KEY
// is set; etc.) lives alongside it there. Development keeps 'unsafe-inline' +
// 'unsafe-eval' for Turbopack/React HMR. See src/proxy.ts for the full policy
// and rationale. No Report-Only copy is kept: we never had report-uri/report-to
// collection infrastructure, so a shadow header would report to nowhere.
//
// The headers below are static (no per-request value), so they stay here.
const isDev = process.env.NODE_ENV !== "production";

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
  // HSTS — prod only (dev is plain http, where the header is meaningless and
  // would poison localhost). The Caddy edge also sets this; emitting it here
  // too keeps it correct if the app is ever fronted by a different proxy.
  ...(isDev
    ? []
    : [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
      ]),
];

const nextConfig: NextConfig = {
  // Standalone output: the Docker runtime ships the traced self-contained
  // server instead of the full prod node_modules + `next start` (~1GB → ~340MB).
  output: "standalone",
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // /api/* is proxied to the API gateway at request time by src/proxy.ts
  // (a config-level rewrites() entry would bake GATEWAY_URL into the build,
  // see #106). Server components fetch the gateway directly via
  // src/lib/api.ts.
};

export default nextConfig;
