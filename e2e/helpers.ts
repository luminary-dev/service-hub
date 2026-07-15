import { expect, type Page } from "@playwright/test";

// Seeded demo accounts (services/*/prisma/seed.js). All share password123 and
// are email-verified, so they clear the #115 verified-email gates. There is no
// seeded *unverified* account, so specs that need one register a fresh customer
// through the UI (registration leaves the email unconfirmed) — see
// `registerCustomer` below.
export const ACCOUNTS = {
  admin: { email: "admin@baas.lk", password: "password123" },
  // Verified customer used for the happy-path (can inquire / review).
  verifiedCustomer: { email: "dilani@example.com", password: "password123" },
  // Provider (prov_nuwan) — Colombo mechanic.
  provider: { email: "nuwan@example.com", password: "password123" },
} as const;

// The route error boundary (src/components/ui/RouteError.tsx + global-error.tsx)
// renders this exact copy on any SSR crash. Its presence in a rendered page is
// the #706-class regression signal — assert it is absent on pages that should
// render their own content.
export const ERROR_BOUNDARY_TEXT = "Something went wrong";

// Log in through the real /login form (not an API shortcut) so the browser
// receives the session cookie exactly as a user would, then wait for the
// post-login redirect off /login to land.
export async function login(
  page: Page,
  { email, password }: { email: string; password: string },
) {
  await page.goto("/login");
  await page.fill("#login-email", email);
  await page.fill("#login-password", password);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.endsWith("/login"), {
      timeout: 20_000,
    }),
    page.getByRole("button", { name: "Sign in", exact: true }).click(),
  ]);
}

// Register a brand-new customer via the UI. The resulting session is signed in
// but email-UNVERIFIED, which is exactly what the verified-email gate specs
// need. Returns the email used (unique per call).
export async function registerCustomer(page: Page): Promise<string> {
  const email = `e2e-pw-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
  await page.goto("/register/customer");
  await page.fill("#reg-name", "E2E Playwright Customer");
  await page.fill("#reg-email", email);
  await page.fill("#reg-phone", "0770000001");
  await page.fill("#reg-password", "e2e-playwright-pass-9x");
  // Legal consent checkbox (ConsentCheckbox, id reg-agree) — required to submit.
  await page.locator("#reg-agree").check();
  await Promise.all([
    page.waitForURL((url) => url.pathname.includes("/providers"), {
      timeout: 20_000,
    }),
    page.getByRole("button", { name: "Create account" }).click(),
  ]);
  return email;
}

// Assert a rendered page did NOT fall back to the route error boundary. The
// guard that would have caught the #706 /admin/providers SSR crash.
export async function expectNoErrorBoundary(page: Page) {
  await expect(page.getByText(ERROR_BOUNDARY_TEXT)).toHaveCount(0);
}
