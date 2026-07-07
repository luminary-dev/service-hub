// Exports the app so tests can use app.request().
import { Hono } from "hono";
import { requireInternalSecret } from "./lib/http";
import { log } from "./lib/log";
import { getRequestId, requestLogger } from "./lib/logging";
import { adminImpersonationRoutes } from "./routes/admin-impersonation";
import { authRoutes } from "./routes/auth";
import { favoritesRoutes } from "./routes/favorites";
import { internalUsersRoutes } from "./routes/internal-users";

export const app = new Hono();

app.use(requestLogger(log));
app.get("/healthz", (c) => c.json({ ok: true, service: "identity-service" }));
app.use("*", requireInternalSecret);

app.route("/api/auth", authRoutes);
app.route("/api/favorites", favoritesRoutes);
app.route("/api/admin/impersonate", adminImpersonationRoutes);
app.route("/internal/users", internalUsersRoutes);

// Fallbacks mirror the monolith's Next.js behavior.
app.notFound((c) => c.json({ error: "Not found" }, 404));
app.onError((err, c) => {
  log.error("unhandled error", { requestId: getRequestId(c), err });
  return c.json({ error: "Internal server error" }, 500);
});
