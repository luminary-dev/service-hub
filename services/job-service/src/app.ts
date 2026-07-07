import { Hono } from "hono";
import { requireInternalSecret } from "./lib/http";
import { log } from "./lib/log";
import { getRequestId, requestLogger } from "./lib/logging";
import { jobs } from "./routes/jobs";
import { admin } from "./routes/admin";
import { internal } from "./routes/internal";

export const app = new Hono();

app.use(requestLogger(log));
app.get("/healthz", (c) => c.json({ ok: true, service: "job-service" }));
app.use("*", requireInternalSecret);

app.route("/api/jobs", jobs);
app.route("/", admin);
app.route("/internal", internal);

// Fallbacks mirror the monolith's Next.js behavior.
app.notFound((c) => c.json({ error: "Not found" }, 404));
app.onError((err, c) => {
  log.error("unhandled error", { requestId: getRequestId(c), err });
  return c.json({ error: "Internal server error" }, 500);
});
