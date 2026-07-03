// Exports the app so tests can use app.request().
import { Hono } from "hono";
import { logger } from "hono/logger";
import { requireInternalSecret } from "./lib/http";
import { authRoutes } from "./routes/auth";
import { favoritesRoutes } from "./routes/favorites";
import { internalUsersRoutes } from "./routes/internal-users";

export const app = new Hono();

app.use(logger());
app.get("/healthz", (c) => c.json({ ok: true, service: "identity-service" }));
app.use("*", requireInternalSecret);

app.route("/api/auth", authRoutes);
app.route("/api/favorites", favoritesRoutes);
app.route("/internal/users", internalUsersRoutes);

// Fallbacks mirror the monolith's Next.js behavior.
app.notFound((c) => c.json({ error: "Not found" }, 404));
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "Internal server error" }, 500);
});
