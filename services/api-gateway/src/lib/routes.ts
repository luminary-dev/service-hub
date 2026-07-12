export type ServiceName = "identity" | "provider" | "review" | "job" | "media";

export type ResolvedRoute = { service: ServiceName; path: string };

// Pure routing table (longest prefix first). Returns the upstream service and
// the (possibly rewritten) upstream path, or null → 404. Paths containing
// /internal are never forwarded.
export function resolveRoute(pathname: string): ResolvedRoute | null {
  if (containsInternal(pathname)) return null;

  // /api/files/<service>/* → upstream /files/*
  // File serving moved to media-service (#media extraction). The namespace
  // segment is preserved so media picks the right store; existing
  // /api/files/<provider|review>/... URLs keep resolving unchanged.
  if (
    pathname.startsWith("/api/files/provider/") ||
    pathname.startsWith("/api/files/review/") ||
    pathname.startsWith("/api/files/category/") ||
    pathname.startsWith("/api/files/user/")
  ) {
    return { service: "media", path: "/files" + pathname.slice("/api/files".length) };
  }

  // Customer account history (#46): exact paths, each owned by the service
  // that holds the data.
  if (pathname === "/api/account/inquiries") {
    return { service: "provider", path: pathname };
  }
  if (pathname === "/api/account/reviews") {
    return { service: "review", path: pathname };
  }
  // Account self-service (#396): profile edit + change-email are identity data
  // (name/phone/email live on the User row). Carved out explicitly ahead of the
  // history routes above so they resolve to identity, not provider/review.
  if (
    pathname === "/api/account/profile" ||
    pathname === "/api/account/avatar" ||
    pathname === "/api/account/email/change" ||
    pathname === "/api/account/email/confirm"
  ) {
    return { service: "identity", path: pathname };
  }

  // Review routes carved out of the provider/admin namespaces. This includes
  // review abuse reports (#50): /api/reviews/:id/report and the admin queue
  // at /api/admin/review-reports both belong to review-service; the provider/
  // photo queue at /api/admin/reports falls through to provider-service below.
  if (/^\/api\/providers\/[^/]+\/reviews$/.test(pathname)) {
    return { service: "review", path: pathname };
  }
  if (pathname.startsWith("/api/admin/reviews/")) {
    return { service: "review", path: pathname };
  }
  if (
    pathname === "/api/admin/review-reports" ||
    pathname.startsWith("/api/admin/review-reports/")
  ) {
    return { service: "review", path: pathname };
  }
  // Moderation audit trail (#227): review-service's log of the actions it
  // owns (review delete, report resolve/dismiss); the provider/category/photo
  // log at /api/admin/audit-log falls through to provider-service below.
  if (pathname === "/api/admin/review-audit-log") {
    return { service: "review", path: pathname };
  }
  if (pathname.startsWith("/api/reviews/")) {
    return { service: "review", path: pathname };
  }

  // User management (#220) is identity-service data; carved out of the
  // generic /api/admin/ fallback below the same way review-service's queues
  // are.
  if (pathname === "/api/admin/users" || pathname.startsWith("/api/admin/users/")) {
    return { service: "identity", path: pathname };
  }

  // Admin impersonation ("view as", #234) — identity-service owns User rows
  // and mints/clears the impersonation cookie, so both the start (:userId)
  // and end routes belong there rather than falling through to provider-
  // service with the rest of /api/admin/*.
  if (
    pathname === "/api/admin/impersonate/end" ||
    /^\/api\/admin\/impersonate\/[^/]+$/.test(pathname)
  ) {
    return { service: "identity", path: pathname };
  }

  // Admin dashboard analytics (#219): signups live on identity-service and
  // the "open reports" metric's review half lives on review-service — both
  // carved out ahead of the generic /api/admin/ → provider-service fallback.
  if (pathname === "/api/admin/signups") {
    return { service: "identity", path: pathname };
  }
  if (pathname === "/api/admin/review-stats") {
    return { service: "review", path: pathname };
  }

  // Admin job management (#222): job-service owns JobRequest/JobResponse; the
  // rest of /api/admin/ falls through to provider-service below.
  if (
    pathname === "/api/admin/jobs" ||
    pathname.startsWith("/api/admin/jobs/")
  ) {
    return { service: "job", path: pathname };
  }

  // Everything else under /api/admin/, including the notification-badge
  // counts endpoint (#233, /api/admin/notifications/counts), belongs to
  // provider-service; the review-owned counterpart above
  // (/api/admin/review-reports/count) is already carved out.
  if (pathname.startsWith("/api/admin/")) {
    return { service: "provider", path: pathname };
  }

  // Work-photo abuse reports (#50) — photos are provider-service data.
  if (/^\/api\/photos\/[^/]+\/report$/.test(pathname)) {
    return { service: "provider", path: pathname };
  }

  if (pathname.startsWith("/api/auth/")) {
    return { service: "identity", path: pathname };
  }
  if (pathname === "/api/favorites" || pathname.startsWith("/api/favorites/")) {
    return { service: "identity", path: pathname };
  }

  if (
    pathname === "/api/providers" ||
    pathname.startsWith("/api/providers/") ||
    pathname.startsWith("/api/provider/") ||
    pathname.startsWith("/api/inquiries/") ||
    pathname === "/api/categories" ||
    pathname === "/api/stats"
  ) {
    return { service: "provider", path: pathname };
  }

  if (pathname === "/api/jobs" || pathname.startsWith("/api/jobs/")) {
    return { service: "job", path: pathname };
  }

  return null;
}

function containsInternal(pathname: string): boolean {
  if (pathname.includes("/internal")) return true;
  try {
    // Also catch percent-encoded attempts (e.g. %2Finternal).
    return decodeURIComponent(pathname).includes("/internal");
  } catch {
    return true; // malformed encoding — refuse to route
  }
}

export function serviceUrl(service: ServiceName): string {
  switch (service) {
    case "identity":
      return process.env.IDENTITY_SERVICE_URL ?? "http://localhost:4001";
    case "provider":
      return process.env.PROVIDER_SERVICE_URL ?? "http://localhost:4002";
    case "review":
      return process.env.REVIEW_SERVICE_URL ?? "http://localhost:4003";
    case "job":
      return process.env.JOB_SERVICE_URL ?? "http://localhost:4004";
    case "media":
      return process.env.MEDIA_SERVICE_URL ?? "http://localhost:4006";
  }
}
