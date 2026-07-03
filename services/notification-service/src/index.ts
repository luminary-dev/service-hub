import "./load-env";
import { serve } from "@hono/node-server";
import { app } from "./app";

const port = Number(process.env.PORT ?? 4005);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`notification-service listening on :${info.port}`);
});
