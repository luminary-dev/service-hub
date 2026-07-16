// The gateway sits on the public edge and, unlike the backend services, has no
// global internal-secret gate — it ADDS the secret to upstream requests (see
// lib/proxy.ts) rather than requiring it. But /metrics is internal RED
// telemetry (route names, request counts, latencies) that must not be
// world-readable (#742), so it is guarded explicitly with the same secret the
// gateway stamps upstream. The Prometheus scrape must send the
// x-internal-secret header.
import type { Context, Next } from "hono";
import { timingSafeEqual } from "node:crypto";

// Mirror lib/proxy.ts: fail fast in production rather than silently falling back
// to the public dev constant.
if (!process.env.INTERNAL_API_SECRET && process.env.NODE_ENV === "production") {
  throw new Error("INTERNAL_API_SECRET must be set in production");
}

const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET ?? "dev-internal-secret";
const INTERNAL_SECRET_BYTES = Buffer.from(INTERNAL_SECRET);

// Constant-time comparison — a plain `!==` short-circuits on the first differing
// byte, leaking the secret's length/prefix through response timing.
function secretMatches(provided: string | undefined): boolean {
  if (provided === undefined) return false;
  const providedBytes = Buffer.from(provided);
  if (providedBytes.length !== INTERNAL_SECRET_BYTES.length) return false;
  return timingSafeEqual(providedBytes, INTERNAL_SECRET_BYTES);
}

// Route-scoped guard for /metrics. Applied only to the scrape endpoint, never to
// the public /api/* surface (the gateway is the public entry for those).
export async function requireInternalSecret(c: Context, next: Next) {
  if (!secretMatches(c.req.header("x-internal-secret"))) {
    return c.json({ error: "Forbidden" }, 403);
  }
  await next();
}
