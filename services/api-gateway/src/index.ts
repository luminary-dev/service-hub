import "./load-env";
import { serve } from "@hono/node-server";
import { app } from "./app";
import { closeRedis } from "./lib/rate-limit";

const port = Number(process.env.PORT ?? 4000);

const server = serve({ fetch: app.fetch, port }, (info) => {
  console.log(`api-gateway listening on :${info.port}`);
});

// Graceful shutdown: stop accepting connections, drain in-flight requests,
// close the shared Redis connection, then exit. Force-exit if draining stalls
// past the grace window so the orchestrator's SIGKILL is never what stops us.
let shuttingDown = false;
function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`api-gateway received ${signal}, shutting down`);
  const forced = setTimeout(() => {
    console.error("api-gateway forced exit after shutdown timeout");
    process.exit(1);
  }, 10_000);
  forced.unref();
  server.close(async () => {
    try {
      await closeRedis();
    } catch (err) {
      console.error("api-gateway error during shutdown", err);
    }
    clearTimeout(forced);
    process.exit(0);
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
