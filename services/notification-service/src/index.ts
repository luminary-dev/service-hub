import "./load-env";
import { serve } from "@hono/node-server";
import { app } from "./app";
import { db } from "./db";
import { initErrorCapture } from "./lib/errors";
import { log } from "./lib/log";
import { installProcessErrorHandlers } from "./lib/logging";
import { initMetrics } from "./lib/metrics";
import { initPush } from "./lib/push";
import {
  closeQueueRedis,
  flushPendingRetries,
  startEmailWorker,
  stopEmailWorker,
} from "./lib/queue";

const port = Number(process.env.PORT ?? 4005);

// Init the error-capture backend (GlitchTip, #34) BEFORE the process handlers
// so a process-level capture has an initialised client. No-op if SENTRY_DSN is
// unset. See lib/errors.ts.
initErrorCapture("notification-service");

// Last-resort structured capture for errors outside a request (#34); Hono's
// onError covers errors inside one. See lib/logging.ts.
installProcessErrorHandlers(log);

// Register Prometheus default + process metrics under this service's label;
// per-request RED metrics + the /metrics scrape route live in the Hono app.
initMetrics("notification-service");

// Email delivery worker + reclaim sweep (lib/queue.ts). No-op without
// REDIS_URL — enqueue then degrades to direct one-attempt sends.
startEmailWorker();

// Mobile push (#798): one startup line stating whether FCM is configured.
// Unset → every push path is a no-op (lib/push.ts).
initPush();

const server = serve({ fetch: app.fetch, port }, (info) => {
  log.info("listening", { port: info.port });
});

// Graceful shutdown: stop accepting connections, drain in-flight requests,
// stop the queue worker, disconnect Redis + Prisma, then exit. Force-exit if
// draining stalls past the grace window so the orchestrator's SIGKILL is
// never what stops us.
let shuttingDown = false;
function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info("shutting down", { signal });
  stopEmailWorker();
  const forced = setTimeout(() => {
    log.error("forced exit after shutdown timeout");
    process.exit(1);
  }, 10_000);
  forced.unref();
  server.close(async () => {
    try {
      // Flush pending delayed retries back to the durable queue before the
      // connections close (#751) — the worker loop is already stopped, so no
      // poller races the flush.
      await flushPendingRetries();
      await closeQueueRedis();
      await db.$disconnect();
    } catch (err) {
      log.error("error during shutdown", { err });
    }
    clearTimeout(forced);
    process.exit(0);
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
