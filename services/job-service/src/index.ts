import "./load-env";
import { serve } from "@hono/node-server";
import { app } from "./app";

const port = Number(process.env.PORT ?? 4004);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`job-service listening on :${info.port}`);
});
