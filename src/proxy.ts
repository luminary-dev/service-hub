import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { LOCALE_HEADER } from "@/lib/links";

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
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (pathname === "/si" || pathname.startsWith("/si/")) {
    const destination = request.nextUrl.clone();
    destination.pathname = pathname === "/si" ? "/" : pathname.slice(3);
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set(LOCALE_HEADER, "si");
    return NextResponse.rewrite(destination, {
      request: { headers: requestHeaders },
    });
  }

  if (pathname.startsWith("/api/")) {
    const gateway = process.env.GATEWAY_URL ?? "http://localhost:4000";
    return NextResponse.rewrite(new URL(pathname + search, gateway));
  }

  // Any other (English-root) page route: strip a client-forgeable x-locale and
  // pin it to "en" so the URL — not the header — is the authoritative locale.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(LOCALE_HEADER, "en");
  return NextResponse.next({ request: { headers: requestHeaders } });
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
