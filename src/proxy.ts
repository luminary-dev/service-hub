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

  const gateway = process.env.GATEWAY_URL ?? "http://localhost:4000";
  return NextResponse.rewrite(new URL(pathname + search, gateway));
}

export const config = {
  matcher: ["/api/:path*", "/si", "/si/:path*"],
};
