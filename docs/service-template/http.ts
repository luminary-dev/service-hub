// Canonical shared helpers — every service keeps an identical copy at
// src/lib/http.ts (services are self-contained; no shared package).
import type { Context, Next } from "hono";
import { timingSafeEqual } from "node:crypto";

export type AuthUser = { userId: string; role: string; name: string };

// The internal secret gates every non-/healthz request between services and is
// what makes the gateway's forwarded identity headers trustworthy. A missing
// value in production would silently fall back to this public, source-visible
// constant — fail fast instead (mirrors the AUTH_SECRET guard).
if (!process.env.INTERNAL_API_SECRET && process.env.NODE_ENV === "production") {
  throw new Error("INTERNAL_API_SECRET must be set in production");
}

const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET ?? "dev-internal-secret";
const INTERNAL_SECRET_BYTES = Buffer.from(INTERNAL_SECRET);

// Constant-time comparison — a plain `!==` short-circuits on the first
// differing byte, leaking the secret's length/prefix through response timing.
// Since this secret is the linchpin that makes the gateway's forwarded
// identity headers authoritative, compare it in constant time.
function secretMatches(provided: string | undefined): boolean {
  if (provided === undefined) return false;
  const providedBytes = Buffer.from(provided);
  if (providedBytes.length !== INTERNAL_SECRET_BYTES.length) return false;
  return timingSafeEqual(providedBytes, INTERNAL_SECRET_BYTES);
}

// Services are never exposed publicly; only the gateway is. Every request must
// carry the internal secret the gateway (or a sibling service) attaches.
// Applied globally except /healthz.
export async function requireInternalSecret(c: Context, next: Next) {
  if (!secretMatches(c.req.header("x-internal-secret"))) {
    return c.json({ error: "Forbidden" }, 403);
  }
  await next();
}

// Identity forwarded by the gateway after JWT verification. Absent headers
// mean an unauthenticated request — each route decides its own 401/403.
export function getAuth(c: Context): AuthUser | null {
  const userId = c.req.header("x-user-id");
  if (!userId) return null;
  return {
    userId,
    role: c.req.header("x-user-role") ?? "CUSTOMER",
    name: decodeURIComponent(c.req.header("x-user-name") ?? ""),
  };
}

// Admin authorization tiers (#226). ADMIN = full access; SUPPORT = read +
// resolve/dismiss reports only (nothing destructive).
export function isFullAdmin(c: Context): boolean {
  return getAuth(c)?.role === "ADMIN";
}
export function isSupportOrAdmin(c: Context): boolean {
  const r = getAuth(c)?.role;
  return r === "ADMIN" || r === "SUPPORT";
}

export function getLocale(c: Context): "en" | "si" {
  return c.req.header("x-locale") === "si" ? "si" : "en";
}

// Public web origin, for links embedded in emails.
export function getOrigin(c: Context): string {
  return c.req.header("x-origin") ?? process.env.WEB_ORIGIN ?? "http://localhost:3000";
}

// Service-to-service call. Callers pass the peer base URL from env
// (e.g. process.env.IDENTITY_SERVICE_URL).
export async function s2s(
  baseUrl: string,
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  // FormData bodies (file uploads) must keep the multipart content-type +
  // boundary fetch sets for them, and need a longer budget for processing.
  const isForm = init.body instanceof FormData;
  const attempt = () =>
    fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        ...(isForm ? {} : { "content-type": "application/json" }),
        ...(init.headers ?? {}),
        "x-internal-secret": INTERNAL_SECRET,
      },
      signal: AbortSignal.timeout(isForm ? 15000 : 5000),
    });

  // Retry only idempotent reads. A single bounded retry (with jitter) turns a
  // transient peer blip — a network error, timeout, or 5xx — into a success
  // instead of a user-facing 502. Writes (POST/PUT/PATCH/DELETE) are never
  // retried, to avoid duplicate side effects.
  const method = (init.method ?? "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD") return attempt();

  try {
    const res = await attempt();
    if (res.status < 500) return res;
    // Drop the failed response body before retrying so the connection frees.
    void res.body?.cancel().catch(() => {});
  } catch {
    // Network error / timeout — fall through to the single retry.
  }
  await new Promise((r) => setTimeout(r, 100 + Math.floor(Math.random() * 150)));
  return attempt();
}
