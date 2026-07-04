import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Mirror the "@/*" path alias from tsconfig.json so tests can exercise
    // modules that import through it (e.g. components importing "@/lib/i18n").
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    // Lib and proxy tests run in plain node. Component tests opt into the
    // DOM with a `// @vitest-environment jsdom` pragma at the top of the
    // file, so the jsdom overhead is paid only where a DOM is needed.
    environment: "node",
  },
});
