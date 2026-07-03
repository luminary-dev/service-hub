import path from "node:path";
import { defineConfig } from "prisma/config";

// Prisma 7 no longer auto-loads .env when a config file is present, so load it
// ourselves for local CLI use. In CI / postinstall the file is absent and the
// env vars are provided directly, so a missing file is not an error.
try {
  process.loadEnvFile();
} catch {
  // no .env file — rely on the ambient environment
}

// The connection URL lives here for CLI commands (generate, db push, migrate,
// validate); the app connects at runtime via the pg adapter in src/lib/db.ts.
// Using process.env directly (not the throwing `env()` helper) so `generate`,
// which needs no connection, still works when DATABASE_URL is unset.
export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
