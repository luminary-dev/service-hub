// Canonical src/app.ts shape (exports the app so tests can use app.request()).
import { Hono } from "hono";
import { db } from "./db";
import { requireInternalSecret } from "./lib/http";
import { log } from "./lib/log";
import { getRequestId, requestLogger } from "./lib/logging";

const SERVICE = "example-service";

export const app = new Hono();

// Structured JSON request logging (one line per request; /healthz is skipped).
app.use(requestLogger(log));

// Health. The FOUR DB services (identity, provider, review, job) run this as a
// readiness probe: confirm Postgres is reachable so the orchestrator can
// restart / depool an instance whose DB connection has died. A static { ok }
// would keep traffic flowing to a service that can't serve any real request.
// Stateless services (gateway, chat, notification, media) instead return the
// static `c.json({ ok: true, service: SERVICE })`.
app.get("/healthz", async (c) => {
  try {
    await Promise.race([
      db.$queryRaw`SELECT 1`,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("db healthcheck timeout")), 2000)
      ),
    ]);
    return c.json({ ok: true, service: SERVICE });
  } catch {
    return c.json({ ok: false, service: SERVICE, db: "down" }, 503);
  }
});

app.use("*", requireInternalSecret);

// app.route("/api/...", routes) ... mount routes here.

// Fallbacks mirror the monolith's Next.js behavior.
app.notFound((c) => c.json({ error: "Not found" }, 404));
app.onError((err, c) => {
  log.error("unhandled error", { requestId: getRequestId(c), err });
  return c.json({ error: "Internal server error" }, 500);
});
