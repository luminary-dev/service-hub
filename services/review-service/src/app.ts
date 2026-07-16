import { Hono } from "hono";
import { db } from "./db";
import { jsonError } from "./lib/api-error";
import { requireInternalSecret } from "./lib/http";
import { captureException } from "./lib/errors";
import { log } from "./lib/log";
import { getRequestId, requestLogger } from "./lib/logging";
import { metricsHandler, metricsMiddleware } from "./lib/metrics";
import { reviews } from "./routes/reviews";
import { reports } from "./routes/reports";
import { account } from "./routes/account";
import { internal } from "./routes/internal";

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
    return c.json({ ok: true, service: "review-service" });
  } catch {
    return c.json({ ok: false, service: "review-service", db: "down" }, 503);
  }
});
// /metrics is public RED telemetry, scraped by Prometheus over the internal
// network (loopback in dev, backend-only in prod). The service port is never
// exposed publicly and /metrics is never routed through the gateway, so it
// needs no secret — Prometheus can't send a custom x-internal-secret header.
app.get("/metrics", metricsHandler);
app.use("*", requireInternalSecret);

app.route("/", reviews);
app.route("/", reports);
app.route("/", account);
app.route("/internal", internal);

// Fallbacks mirror the monolith's Next.js behavior. Carry a stable `code` too
// (#761) so the web client can localize even these generic errors.
app.notFound((c) => jsonError(c, 404, "NOT_FOUND", "Not found"));
app.onError((err, c) => {
  const requestId = getRequestId(c);
  log.error("unhandled error", { requestId, err });
  // Report to the error backend (no-op if SENTRY_DSN unset).
  captureException(err, { requestId, path: c.req.path, method: c.req.method });
  return jsonError(c, 500, "INTERNAL", "Internal server error");
});
