// Exports the app so tests can use app.request().
import { Hono } from "hono";
import { requireInternalSecret } from "./lib/http";
import { captureException } from "./lib/errors";
import { log } from "./lib/log";
import { getRequestId, requestLogger } from "./lib/logging";
import { metricsHandler, metricsMiddleware } from "./lib/metrics";
import { chatRoutes } from "./routes/chat";

export const app = new Hono();

app.use(requestLogger(log));
app.use(metricsMiddleware());
app.get("/healthz", (c) => c.json({ ok: true, service: "chat-service" }));
// /metrics is public RED telemetry, scraped by Prometheus over the internal
// network (loopback in dev, backend-only in prod). The service port is never
// exposed publicly and /metrics is never routed through the gateway, so it
// needs no secret — Prometheus can't send a custom x-internal-secret header.
app.get("/metrics", metricsHandler);
app.use("*", requireInternalSecret);

app.route("/", chatRoutes);

app.notFound((c) => c.json({ error: "Not found" }, 404));
app.onError((err, c) => {
  const requestId = getRequestId(c);
  log.error("unhandled error", { requestId, err });
  // Report to the error backend (no-op if SENTRY_DSN unset).
  captureException(err, { requestId, path: c.req.path, method: c.req.method });
  return c.json({ error: "Internal server error" }, 500);
});
