import { defineConfig } from "vitest/config";

// Per-service coverage config for CI visibility (#262). The `thresholds` below
// are a deliberately low baseline that currently passes — a ratchet floor so
// coverage can never silently regress; raise them as the suite grows.
export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "json-summary", "html"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.ts"],
      thresholds: {
        lines: 5,
        functions: 5,
        branches: 5,
        statements: 5,
      },
    },
  },
});
