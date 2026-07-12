// Canonical src/index.ts shape.
import "./load-env";
import { serve } from "@hono/node-server";
import { app } from "./app";
import { db } from "./db";

const SERVICE = "example-service";
const port = Number(process.env.PORT ?? 4001);

const server = serve({ fetch: app.fetch, port }, (info) => {
  console.log(`${SERVICE} listening on :${info.port}`);
});

// Graceful shutdown: stop accepting connections, drain in-flight requests,
// disconnect Prisma, then exit. Force-exit if draining stalls past the grace
// window so the orchestrator's SIGKILL is never what stops us. (Stateless
// services with no DB drop the db.$disconnect() call.)
let shuttingDown = false;
function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${SERVICE} received ${signal}, shutting down`);
  const forced = setTimeout(() => {
    console.error(`${SERVICE} forced exit after shutdown timeout`);
    process.exit(1);
  }, 10_000);
  forced.unref();
  server.close(async () => {
    try {
      await db.$disconnect();
    } catch (err) {
      console.error(`${SERVICE} error during shutdown`, err);
    }
    clearTimeout(forced);
    process.exit(0);
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
