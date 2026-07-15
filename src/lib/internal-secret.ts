// The web SSR runtime calls chat-service and identity-service `/internal/*`
// directly (bypassing the gateway), stamping this shared secret on every such
// request. If it silently fell back to the public, source-visible dev constant
// in production, anyone able to reach a service directly could forge
// gateway-trusted identity headers. Fail fast so the web runtime refuses to
// boot without the secret in production — mirroring the guard every backend
// service (`services/*/src/lib/http.ts`) and the gateway
// (`services/api-gateway/src/lib/proxy.ts`) already carry.
import "server-only";

// Fail fast at runtime, NOT during `next build`. The production build evaluates
// route/server modules under NODE_ENV=production but without runtime secrets
// provisioned (CI builds the image with only AUTH_SECRET), so throwing at build
// time would make every deploy image un-buildable. Next sets NEXT_PHASE to
// "phase-production-build" only while building; a running server (standalone /
// `next start`) never has it set, so the guard still trips on boot/first import
// in a real production runtime.
if (
  !process.env.INTERNAL_API_SECRET &&
  process.env.NODE_ENV === "production" &&
  process.env.NEXT_PHASE !== "phase-production-build"
) {
  throw new Error("INTERNAL_API_SECRET must be set in production");
}

export const INTERNAL_API_SECRET =
  process.env.INTERNAL_API_SECRET ?? "dev-internal-secret";
