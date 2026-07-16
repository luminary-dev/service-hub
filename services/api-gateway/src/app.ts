import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { csrfMiddleware } from "./lib/csrf";
import { captureException } from "./lib/errors";
import { requireInternalSecret } from "./lib/internal-secret";
import { log } from "./lib/log";
import { getRequestId } from "./lib/logging";
import { metricsHandler, metricsMiddleware } from "./lib/metrics";
import { proxyRequest } from "./lib/proxy";
import { rateLimitMiddleware } from "./lib/rate-limit";
import { gatewayRequestLogger } from "./lib/request-log";

// Cap request bodies at the public edge. proxyRequest buffers the whole body
// with arrayBuffer() before forwarding, so without this a multi-GB upload would
// OOM the only public entry point. 6MB covers the 5MB image cap plus multipart
// overhead; larger uploads get 413 before any buffering.
const MAX_BODY_BYTES = 6 * 1024 * 1024;

export const app = new Hono();

// Public edge: never trust a client-sent x-request-id — generate our own here
// and propagate it upstream (see lib/proxy.ts buildUpstreamHeaders). The
// gateway logger also stamps the client IP on every line (#759) so 401/429
// clusters can be grouped by attacker IP.
app.use(gatewayRequestLogger(log));
app.use(metricsMiddleware());

// Public entry — no global internal-secret check here; the gateway ADDS the
// secret to upstream requests instead. /healthz stays open for compose probes.
app.get("/healthz", (c) => c.json({ ok: true, service: "api-gateway" }));
// /metrics is internal RED telemetry and must not be world-readable (#742), so
// it is guarded explicitly with the internal secret (the gateway has no global
// gate). The Prometheus scrape must send the x-internal-secret header.
app.get("/metrics", requireInternalSecret, metricsHandler);

app.use("/api/*", csrfMiddleware);
app.use("/api/*", rateLimitMiddleware);
app.use(
  "/api/*",
  bodyLimit({
    maxSize: MAX_BODY_BYTES,
    onError: (c) => c.json({ error: "Payload too large" }, 413),
  })
);
app.all("/api/*", proxyRequest);

app.notFound((c) => c.json({ error: "Not found" }, 404));
app.onError((err, c) => {
  const requestId = getRequestId(c);
  log.error("unhandled error", { requestId, err });
  // Report to the error backend (no-op if SENTRY_DSN unset).
  captureException(err, { requestId, path: c.req.path, method: c.req.method });
  return c.json({ error: "Internal server error" }, 500);
});
