import { Hono } from "hono";
import { db } from "./db";
import { requireInternalSecret } from "./lib/http";
import { captureException } from "./lib/errors";
import { log } from "./lib/log";
import { getRequestId, requestLogger } from "./lib/logging";
import { metricsHandler, metricsMiddleware } from "./lib/metrics";
import { jobs } from "./routes/jobs";
import { admin } from "./routes/admin";
import { internal } from "./routes/internal";
import { reports } from "./routes/reports";

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
    return c.json({ ok: true, service: "job-service" });
  } catch {
    return c.json({ ok: false, service: "job-service", db: "down" }, 503);
  }
});
app.get("/metrics", metricsHandler);
app.use("*", requireInternalSecret);

app.route("/api/jobs", jobs);
app.route("/", admin);
app.route("/", reports);
app.route("/internal", internal);

// Fallbacks mirror the monolith's Next.js behavior.
app.notFound((c) => c.json({ error: "Not found" }, 404));
app.onError((err, c) => {
  const requestId = getRequestId(c);
  log.error("unhandled error", { requestId, err });
  // Report to the error backend (no-op if SENTRY_DSN unset).
  captureException(err, { requestId, path: c.req.path, method: c.req.method });
  return c.json({ error: "Internal server error" }, 500);
});
