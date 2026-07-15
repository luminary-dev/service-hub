// Gateway-specific request logger (#759). It mirrors the shared
// lib/logging.ts requestLogger — one structured "request" line per completed
// request, with the request id stashed on the context via getRequestId — but
// ALSO stamps the resolved client IP on every line so failed-login / 401 / 429
// clusters can be grouped by attacker IP (credential-stuffing is otherwise
// invisible in Loki).
//
// Why not in the shared logging.ts: that file is a byte-identical canonical
// copy across all 10 services (enforced by src/lib/shared-copies.test.ts), and
// only the gateway can resolve a TRUSTWORTHY client IP — clientIp() (lib/
// rate-limit.ts) honors TRUSTED_PROXY_HOPS and never trusts the forgeable left
// edge of X-Forwarded-For. A service logging a client-forwarded address would
// be logging attacker-controlled data, so the client IP belongs on the gateway
// tier alone.
import { randomUUID } from "node:crypto";
import type { MiddlewareHandler } from "hono";
import type { Logger } from "./logging";
import { clientIp } from "./rate-limit";

// The gateway sits on the public edge, so a client-sent x-request-id is never
// trusted — we always generate our own and propagate it upstream (see
// lib/proxy.ts buildUpstreamHeaders). Stored on the context so onError / the
// proxy can read it via getRequestId (from lib/logging.ts).
export function gatewayRequestLogger(log: Logger): MiddlewareHandler {
  return async (c, next) => {
    const requestId = randomUUID();
    c.set("requestId", requestId);
    const start = Date.now();
    await next();
    if (c.req.path === "/healthz") return;
    log.info("request", {
      requestId,
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      durationMs: Date.now() - start,
      clientIp: clientIp(c),
    });
  };
}
