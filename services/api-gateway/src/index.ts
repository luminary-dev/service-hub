import "./load-env";
import { serve } from "@hono/node-server";
import { app } from "./app";
import { log } from "./lib/log";
import { installProcessErrorHandlers } from "./lib/logging";
import { initMetrics } from "./lib/metrics";
import { checkProxyConfig, closeRedis } from "./lib/rate-limit";

const port = Number(process.env.PORT ?? 4000);

// Last-resort structured capture for errors outside a request (#34); Hono's
// onError covers errors inside one. See lib/logging.ts.
installProcessErrorHandlers(log);

// Register Prometheus default + process metrics under this service's label;
// per-request RED metrics + the /metrics scrape route live in the Hono app.
initMetrics("api-gateway");

// Warn (don't crash) if TRUSTED_PROXY_HOPS looks misconfigured for the deployed
// topology (#374) — a silent 0 collapses every client into one rate-limit
// bucket behind the Caddy→web→gateway chain.
checkProxyConfig();

const server = serve({ fetch: app.fetch, port }, (info) => {
  log.info("listening", { port: info.port });
});

// Graceful shutdown: stop accepting connections, drain in-flight requests,
// close the shared Redis connection, then exit. Force-exit if draining stalls
// past the grace window so the orchestrator's SIGKILL is never what stops us.
let shuttingDown = false;
function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info("shutting down", { signal });
  const forced = setTimeout(() => {
    log.error("forced exit after shutdown timeout");
    process.exit(1);
  }, 10_000);
  forced.unref();
  server.close(async () => {
    try {
      await closeRedis();
    } catch (err) {
      log.error("error during shutdown", { err });
    }
    clearTimeout(forced);
    process.exit(0);
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
