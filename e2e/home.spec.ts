import { expect, test } from "@playwright/test";
import { expectNoErrorBoundary } from "./helpers";

test.describe("home", () => {
  test("renders the hero and a route into the directory", async ({ page }) => {
    await page.goto("/");

    // The hero <h1> is the primary conversion anchor. Assert it rendered its
    // own copy (not the error boundary) rather than pinning the full localized
    // string.
    const hero = page.getByRole("heading", { level: 1 });
    await expect(hero).toBeVisible();
    await expect(hero).toContainText("The tradespeople Sri Lanka");

    // There must be at least one way into the directory from the landing page.
    await expect(
      page.locator('a[href$="/providers"], a[href*="/providers?"]').first(),
    ).toBeVisible();

    await expectNoErrorBoundary(page);
  });
});
