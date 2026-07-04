import { Hono } from "hono";
import { requireInternalSecret } from "./lib/http";
import { log } from "./lib/log";
import { getRequestId, requestLogger } from "./lib/logging";
import { emailRoutes } from "./routes/email";

export const app = new Hono();

app.use(requestLogger(log));
app.get("/healthz", (c) => c.json({ ok: true, service: "notification-service" }));
app.use("*", requireInternalSecret);

app.route("/internal/email", emailRoutes);

// Fallbacks mirror the monolith's Next.js behavior.
app.notFound((c) => c.json({ error: "Not found" }, 404));
app.onError((err, c) => {
  log.error("unhandled error", { requestId: getRequestId(c), err });
  return c.json({ error: "Internal server error" }, 500);
});
