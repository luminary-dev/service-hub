import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Runtime /api/* proxy to the API gateway (#106).
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
export function proxy(request: NextRequest) {
  const gateway = process.env.GATEWAY_URL ?? "http://localhost:4000";
  const destination = new URL(
    request.nextUrl.pathname + request.nextUrl.search,
    gateway,
  );
  return NextResponse.rewrite(destination);
}

export const config = {
  matcher: "/api/:path*",
};
