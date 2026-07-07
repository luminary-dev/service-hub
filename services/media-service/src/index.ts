import "./load-env";
import { serve } from "@hono/node-server";
import { app } from "./app";

const port = Number(process.env.PORT ?? 4006);

const server = serve({ fetch: app.fetch, port }, (info) => {
  console.log(`media-service listening on :${info.port}`);
});

// Graceful shutdown: stop accepting connections, drain in-flight requests,
// then exit. Force-exit if draining stalls past the grace window so the
// orchestrator's SIGKILL is never what stops us.
let shuttingDown = false;
function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`media-service received ${signal}, shutting down`);
  const forced = setTimeout(() => {
    console.error("media-service forced exit after shutdown timeout");
    process.exit(1);
  }, 10_000);
  forced.unref();
  server.close(() => {
    clearTimeout(forced);
    process.exit(0);
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
