import { Hono } from "hono";
import { requireInternalSecret } from "./lib/http";
import { log } from "./lib/log";
import { getRequestId, requestLogger } from "./lib/logging";
import { providersRoutes } from "./routes/providers";
import { providerDashboardRoutes } from "./routes/provider";
import { accountRoutes } from "./routes/account";
import { messagesRoutes } from "./routes/messages";
import { adminRoutes } from "./routes/admin";
import { reportsRoutes } from "./routes/reports";
import { internalRoutes } from "./routes/internal";
import { filesRoutes } from "./routes/files";

export const app = new Hono();

app.use(requestLogger(log));
app.get("/healthz", (c) => c.json({ ok: true, service: "provider-service" }));
app.use("*", requireInternalSecret);

app.route("/", providersRoutes);
app.route("/", providerDashboardRoutes);
app.route("/", accountRoutes);
app.route("/", messagesRoutes);
app.route("/", adminRoutes);
app.route("/", reportsRoutes);
app.route("/", internalRoutes);
app.route("/", filesRoutes);

// Fallbacks mirror the monolith's Next.js behavior.
app.notFound((c) => c.json({ error: "Not found" }, 404));
app.onError((err, c) => {
  log.error("unhandled error", { requestId: getRequestId(c), err });
  return c.json({ error: "Internal server error" }, 500);
});
