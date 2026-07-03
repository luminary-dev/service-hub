import { NextRequest, NextResponse } from "next/server";
import { isSameOriginRequest } from "@/lib/csrf";

// CSRF defence-in-depth on top of SameSite=Lax cookies: reject cross-site
// state-changing requests to the API.
export function middleware(req: NextRequest) {
  const allowed = isSameOriginRequest({
    method: req.method,
    secFetchSite: req.headers.get("sec-fetch-site"),
    origin: req.headers.get("origin"),
    host: req.headers.get("host"),
  });
  if (allowed) return NextResponse.next();
  return NextResponse.json(
    { error: "Cross-site request blocked." },
    { status: 403 }
  );
}

export const config = {
  matcher: ["/api/:path*"],
};
