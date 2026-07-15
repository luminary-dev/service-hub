// Exports the app so tests can use app.request().
import { Hono } from "hono";
import { requireInternalSecret } from "./lib/http";
import { captureException } from "./lib/errors";
import { log } from "./lib/log";
import { getRequestId, requestLogger } from "./lib/logging";
import { metricsHandler, metricsMiddleware } from "./lib/metrics";
import { filesRoutes } from "./routes/files";
import { internalRoutes } from "./routes/internal";

export const app = new Hono();

app.use(requestLogger(log));
app.use(metricsMiddleware());
app.get("/healthz", (c) => c.json({ ok: true, service: "media-service" }));
// Everything else — including /files/* (the gateway supplies the secret for it
// on behalf of browsers) AND /metrics (#742) — is behind the internal secret.
// The Prometheus scrape must send the x-internal-secret header; the service
// port is never exposed publicly.
app.use("*", requireInternalSecret);
app.get("/metrics", metricsHandler);

app.route("/", filesRoutes);
app.route("/", internalRoutes);

app.notFound((c) => c.json({ error: "Not found" }, 404));
app.onError((err, c) => {
  const requestId = getRequestId(c);
  log.error("unhandled error", { requestId, err });
  // Report to the error backend (no-op if SENTRY_DSN unset).
  captureException(err, { requestId, path: c.req.path, method: c.req.method });
  return c.json({ error: "Internal server error" }, 500);
});
