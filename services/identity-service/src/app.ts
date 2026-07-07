// Exports the app so tests can use app.request().
import { Hono } from "hono";
import { db } from "./db";
import { requireInternalSecret } from "./lib/http";
import { log } from "./lib/log";
import { getRequestId, requestLogger } from "./lib/logging";
import { adminUsersRoutes } from "./routes/admin-users";
import { authRoutes } from "./routes/auth";
import { favoritesRoutes } from "./routes/favorites";
import { adminRoutes } from "./routes/admin";
import { internalUsersRoutes } from "./routes/internal-users";

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
    return c.json({ ok: true, service: "identity-service" });
  } catch {
    return c.json({ ok: false, service: "identity-service", db: "down" }, 503);
  }
});
app.use("*", requireInternalSecret);

app.route("/api/auth", authRoutes);
app.route("/api/favorites", favoritesRoutes);
app.route("/", adminUsersRoutes);
app.route("/api/admin", adminRoutes);
app.route("/internal/users", internalUsersRoutes);

// Fallbacks mirror the monolith's Next.js behavior.
app.notFound((c) => c.json({ error: "Not found" }, 404));
app.onError((err, c) => {
  log.error("unhandled error", { requestId: getRequestId(c), err });
  return c.json({ error: "Internal server error" }, 500);
});
