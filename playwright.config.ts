import { defineConfig, devices } from "@playwright/test";

// Browser E2E (#671). This is the flagship tier the API-only smoke
// (scripts/e2e-smoke.sh) can't cover: a real browser renders each page, so
// client-side navigation, hydration and full SSR-crash regressions (the #706
// /admin/providers error-boundary that shipped) are caught here.
//
// Specs live under `e2e/` and run with Playwright's own runner (`npx playwright
// test`), completely separate from the vitest web suite (`npm test`, scoped to
// `--dir src`), so neither runner ever picks up the other's files.
//
// They drive a *running, seeded* stack — locally the docker-compose web on
// :3000, in CI the same stack the `e2e` job boots. Nothing is stubbed; these
// are true end-to-end tests, so a stack must be up before they run.
const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

// CI-only knobs: retry once to ride out cold-start flake, and never run the
// (heavier) mobile project's overlap with chromium in parallel workers that
// could starve the single booted stack.
const isCI = !!process.env.CI;

export default defineConfig({
  testDir: "./e2e",
  // Fail the build if a spec is committed with `test.only` left in.
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  workers: isCI ? 2 : undefined,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: isCI
    ? [["html", { open: "never" }], ["list"]]
    : [["list"]],
  use: {
    baseURL: BASE_URL,
    // Keep artifacts cheap on green, rich on red: a trace + screenshot only
    // when a test fails or is retried, uploaded by CI for triage.
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    // Mobile spot-check (#671): a single conversion flow re-run at a phone
    // viewport, tagged @mobile so it can be selected/skipped independently.
    {
      name: "mobile-chrome",
      use: { ...devices["Pixel 7"] },
      grep: /@mobile/,
    },
  ],
});
