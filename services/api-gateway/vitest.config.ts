import { defineConfig } from "vitest/config";

// Per-service coverage config for CI visibility (#262). The `thresholds` below
// are a ratchet floor so coverage can never silently regress; raise them as the
// suite grows. Ratcheted from the original 5% baseline toward actual once the
// proxy / internal-secret / request-log tests landed (#771) — kept a few points
// under measured coverage (~84% lines / 87% branches / 81% functions) so normal
// churn doesn't trip CI.
export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "json-summary", "html"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.ts"],
      thresholds: {
        lines: 80,
        functions: 78,
        branches: 82,
        statements: 80,
      },
    },
  },
});
