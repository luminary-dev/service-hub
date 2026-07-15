import path from "node:path";
import { defineConfig } from "prisma/config";

// Prisma 7 no longer auto-loads .env when a config file is present, so load it
// ourselves for local CLI use. In CI / Docker the file is absent and the env
// vars are provided directly, so a missing file is not an error.
try {
  process.loadEnvFile();
} catch {
  // no .env file — rely on the ambient environment
}

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  datasource: {
    // The Prisma CLI (migrate deploy / db push / introspect) reads its URL from
    // HERE, while the runtime driver adapter (src/db.ts) reads DATABASE_URL on
    // its own. Behind PgBouncer (#674) DATABASE_URL points at the transaction
    // pooler — which `migrate deploy` cannot use (it needs session-scoped state:
    // advisory locks, prepared statements). So the CLI prefers DIRECT_URL, a
    // straight-to-Postgres connection set alongside DATABASE_URL in compose.
    // Prisma 7 dropped datasource `directUrl` from schema.prisma (it lives in
    // this config now); with no pooler (host dev / CI) DIRECT_URL is unset and
    // we fall back to DATABASE_URL, so nothing changes there.
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
  },
});
