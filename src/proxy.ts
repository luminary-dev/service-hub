import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { LOCALE_HEADER } from "@/lib/links";

// 4. Content-Security-Policy with a per-request nonce (#770).
//
// The CSP used to be a static header in next.config.ts, but a build-time
// header can't carry a fresh value per request. To drop 'unsafe-inline' from
// script-src (the XSS-containment weakness in #112/#770) we generate a nonce
// here, hand it to Next via request headers so it stamps `nonce=` on its own
// inline runtime/hydration scripts, and emit the matching CSP as a response
// header on every page route. next.config.ts keeps the other (static) security
// headers but no longer sets Content-Security-Policy, so it's set exactly once.
//
// Production script-src: 'self' 'nonce-<value>' 'strict-dynamic' (+ Turnstile
// origin when configured). 'strict-dynamic' trusts scripts loaded by an
// already-trusted (nonced) script and makes host allowlists a legacy-browser
// fallback. Development KEEPS 'unsafe-inline' AND 'unsafe-eval': Turbopack HMR
// and React devtools rely on eval() and inline scripts, and nonce +
// strict-dynamic breaks HMR, so the nonce hardening is production-only.
const NONCE_HEADER = "x-nonce";
const CSP_HEADER = "Content-Security-Policy";
const TURNSTILE_ORIGIN = "https://challenges.cloudflare.com";

// Web Crypto (edge- and Node-runtime safe): base64 of 16 random bytes.
function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

// Mirrors the directive set that lived in next.config.ts — only script-src
// changed (nonce + strict-dynamic in prod). Everything else is preserved
// verbatim so this stays a drop-in replacement for the static header.
function buildCsp(nonce: string): string {
  const isDev = process.env.NODE_ENV !== "production";
  const turnstile = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);
  const scriptSrc = isDev
    ? `script-src 'self' 'unsafe-inline' 'unsafe-eval'${
        turnstile ? ` ${TURNSTILE_ORIGIN}` : ""
      }`
    : `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${
        turnstile ? ` ${TURNSTILE_ORIGIN}` : ""
      }`;
  return [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://tile.openstreetmap.org",
    "font-src 'self'",
    "connect-src 'self'",
    ...(turnstile ? [`frame-src ${TURNSTILE_ORIGIN}`] : []),
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");
}

// Request headers a page route forwards to the app: the trusted x-locale, plus
// the nonce and CSP so Next can extract `nonce-<value>` and stamp it onto its
// framework/hydration scripts. The server layout also reads x-nonce to nonce
// its manual inline theme <script> (#770).
function pageRequestHeaders(
  request: NextRequest,
  locale: string,
  nonce: string,
  csp: string,
): Headers {
  const headers = new Headers(request.headers);
  headers.set(LOCALE_HEADER, locale);
  headers.set(NONCE_HEADER, nonce);
  headers.set(CSP_HEADER, csp);
  return headers;
}

// 1. Runtime /api/* proxy to the API gateway (#106).
//
// This used to be a rewrites() entry in next.config.ts, but Next resolves
// rewrites() at build time, baking GATEWAY_URL into the routes manifest —
// one image couldn't be promoted across environments. proxy.ts (Next 16's
// rename of middleware, Node runtime) runs per request, so the env var is
// read from the runtime environment here instead.
//
// Client components keep calling same-origin /api/* unchanged; the rewrite
// streams the full request (method/headers/body/query) to the gateway and
// returns its response verbatim, including Set-Cookie. Server components
// don't go through this — they hit the gateway directly via src/lib/api.ts.
//
// When GATEWAY_URL is unset we fall back to http://localhost:4000, matching
// src/lib/api.ts and the previous rewrites() default (local dev).
//
// 2. /si locale prefix (#67): indexable Sinhala URLs.
//
// English stays at the root (canonical, no redirects); /si/* rewrites to the
// same path without the prefix, keeping ONE route tree, and forwards an
// x-locale: si request header upstream (NextResponse.rewrite's
// { request: { headers } } option) that src/lib/locale.ts getLocale() reads
// with priority over the `lang` cookie. The browser keeps the /si URL.
// Unknown paths under /si fall through to the app's not-found (in Sinhala).
//
// 3. x-locale is a trusted signal (#204): the proxy is the trust boundary, so
// it OWNS the x-locale request header. getUrlLocale() derives the URL locale
// from this header and must describe the URL being served, not a client
// preference — so the only thing that may set it to "si" is the /si prefix
// above. Because the matcher now runs on every page route, we overwrite any
// client-supplied x-locale to "en" on non-/si routes; otherwise a spoofed
// `X-Locale: si` on an English-root URL (e.g. /providers) would render Sinhala
// and emit a canonical pointing at /si. The `lang` cookie still drives the
// rendered locale via getLocale(), which reads the cookie directly.
// Root metadata files exist only at the English root. Without this guard the
// /si rewrite would serve them as duplicates (/si/sitemap.xml etc.); skipping
// the rewrite lets them fall through to the app's not-found instead (#379).
const SI_ROOT_METADATA =
  /^\/si\/(?:sitemap\.xml|robots\.txt|manifest\.webmanifest)$/;

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // /api/* is a transparent proxy of the gateway response — no nonce/CSP here
  // (it streams JSON/bytes verbatim, and CSP only governs document contexts).
  if (pathname.startsWith("/api/")) {
    const gateway = process.env.GATEWAY_URL ?? "http://localhost:4000";
    return NextResponse.rewrite(new URL(pathname + search, gateway));
  }

  // Everything below serves a document → attach a per-request nonce + CSP.
  const nonce = generateNonce();
  const csp = buildCsp(nonce);

  if (pathname === "/si" || pathname.startsWith("/si/")) {
    const requestHeaders = pageRequestHeaders(request, "si", nonce, csp);
    if (SI_ROOT_METADATA.test(pathname)) {
      const response = NextResponse.next({
        request: { headers: requestHeaders },
      });
      response.headers.set(CSP_HEADER, csp);
      return response;
    }
    const destination = request.nextUrl.clone();
    destination.pathname = pathname === "/si" ? "/" : pathname.slice(3);
    const response = NextResponse.rewrite(destination, {
      request: { headers: requestHeaders },
    });
    response.headers.set(CSP_HEADER, csp);
    return response;
  }

  // Any other (English-root) page route: strip a client-forgeable x-locale and
  // pin it to "en" so the URL — not the header — is the authoritative locale.
  const requestHeaders = pageRequestHeaders(request, "en", nonce, csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set(CSP_HEADER, csp);
  return response;
}

export const config = {
  matcher: [
    "/api/:path*",
    "/si",
    "/si/:path*",
    // Trust boundary for x-locale (#204): run on all page routes so a spoofed
    // header is always overwritten. Exclude API (handled above), Next internals
    // and metadata assets — they never read x-locale and don't need the proxy.
    "/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
