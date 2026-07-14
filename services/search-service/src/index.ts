import "./load-env";
import { serve } from "@hono/node-server";
import { app } from "./app";
import { db } from "./db";
import { log } from "./lib/log";
import { installProcessErrorHandlers } from "./lib/logging";

const port = Number(process.env.PORT ?? 4008);

// Last-resort structured capture for errors outside a request (#34); Hono's
// onError covers errors inside one. See lib/logging.ts.
installProcessErrorHandlers(log);

const server = serve({ fetch: app.fetch, port }, (info) => {
  log.info("listening", { port: info.port });
});

// Graceful shutdown: stop accepting connections, drain in-flight requests,
// disconnect Prisma, then exit. Force-exit if draining stalls past the grace
// window so the orchestrator's SIGKILL is never what stops us.
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
