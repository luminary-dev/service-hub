import { Hono } from "hono";
import { db } from "./db";
import { requireInternalSecret } from "./lib/http";
import { log } from "./lib/log";
import { getRequestId, requestLogger } from "./lib/logging";
import { reviews } from "./routes/reviews";
import { reports } from "./routes/reports";
import { account } from "./routes/account";
import { internal } from "./routes/internal";

export const app = new Hono();

app.use(requestLogger(log));
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
app.use("*", requireInternalSecret);

app.route("/", reviews);
app.route("/", reports);
app.route("/", account);
app.route("/internal", internal);

// Fallbacks mirror the monolith's Next.js behavior.
app.notFound((c) => c.json({ error: "Not found" }, 404));
app.onError((err, c) => {
  log.error("unhandled error", { requestId: getRequestId(c), err });
  return c.json({ error: "Internal server error" }, 500);
});
