import { expect, test } from "@playwright/test";
import { ACCOUNTS, expectNoErrorBoundary, login } from "./helpers";

// The flagship regression guard (#706). /admin/providers once shipped a full
// SSR crash: the layout still rendered "Baas" while the page body fell back to
// the route error boundary, so the API-only smoke missed it. A real browser
// rendering the authed page is the check that would have caught it.
test.describe("admin /admin/providers", () => {
  test("renders the providers list, not the error boundary", async ({
    page,
  }) => {
    await login(page, ACCOUNTS.admin);
    await page.goto("/admin/providers");

    // The page must render its own header — NOT the error boundary.
    await expectNoErrorBoundary(page);
    await expect(
      page.getByRole("heading", { name: "Providers" }),
    ).toBeVisible();

    // And the data-driven list must have populated (the seeded providers),
    // proving the server component fetched + rendered rather than throwing.
    await expect(page.getByText(/\d+ providers? found/)).toBeVisible();
    await expect(page.locator('a[href*="/admin/providers/"]').first()).toBeVisible();
  });
});
