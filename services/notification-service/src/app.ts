import { Hono } from "hono";
import { db } from "./db";
import { requireInternalSecret } from "./lib/http";
import { captureException } from "./lib/errors";
import { log } from "./lib/log";
import { getRequestId, requestLogger } from "./lib/logging";
import { metricsHandler, metricsMiddleware } from "./lib/metrics";
import { emailRoutes } from "./routes/email";
import { eventRoutes, internalUsers } from "./routes/events";
import { notifications } from "./routes/notifications";

export const app = new Hono();

app.use(requestLogger(log));
app.use(metricsMiddleware());
// Readiness probe: confirm Postgres is reachable so the orchestrator can
// restart / depool an instance whose DB connection has died. A static { ok }
// would keep traffic flowing to a service that can't serve any real request.
app.get("/healthz", async (c) => {
  try {
    await Promise.race([
      db.$queryRaw`SELECT 1`,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("db healthcheck timeout")), 2000)
      ),
    ]);
    return c.json({ ok: true, service: "notification-service" });
  } catch {
    return c.json({ ok: false, service: "notification-service", db: "down" }, 503);
  }
});
// /metrics is public RED telemetry, scraped by Prometheus over the internal
// network (loopback in dev, backend-only in prod). The service port is never
// exposed publicly and /metrics is never routed through the gateway, so it
// needs no secret — Prometheus can't send a custom x-internal-secret header.
app.get("/metrics", metricsHandler);
app.use("*", requireInternalSecret);

// Transactional auth mails keep their dedicated routes permanently; the four
// marketplace email routes stay only until their callers migrate to
// /internal/notifications/events (RFC rollout phase 3), then get deleted.
app.route("/internal/email", emailRoutes);
app.route("/internal/notifications", eventRoutes);
app.route("/internal/users", internalUsers);
app.route("/", notifications);

// Fallbacks mirror the monolith's Next.js behavior.
app.notFound((c) => c.json({ error: "Not found" }, 404));
app.onError((err, c) => {
  const requestId = getRequestId(c);
  log.error("unhandled error", { requestId, err });
  // Report to the error backend (no-op if SENTRY_DSN unset).
  captureException(err, { requestId, path: c.req.path, method: c.req.method });
  return c.json({ error: "Internal server error" }, 500);
});
