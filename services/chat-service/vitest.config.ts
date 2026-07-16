import { defineConfig } from "vitest/config";

// Per-service coverage config for CI visibility (#262). The `thresholds` below
// are a ratchet floor so coverage can never silently regress; raise them as the
// suite grows. Ratcheted from the original 5% baseline toward actual once the
// chat route tests (internal-secret / persona 404 / 503 / SSE framing) landed
// (#771) — kept a few points under measured coverage (~58% lines / 47% branches
// / 54% functions) so normal churn doesn't trip CI.
export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "json-summary", "html"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.ts"],
      thresholds: {
        lines: 55,
        functions: 50,
        branches: 45,
        statements: 52,
      },
    },
  },
});
