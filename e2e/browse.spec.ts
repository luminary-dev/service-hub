import { expect, test, type Page } from "@playwright/test";
import { expectNoErrorBoundary } from "./helpers";

// A card links to /providers/<id>; the nav/hero links point at /providers or
// /providers?… — the trailing-slash-then-id shape selects cards only.
const CARD = 'a[href*="/providers/"]';

async function openFirstProvider(page: Page) {
  await page.goto("/providers");
  const cards = page.locator(CARD);
  await expect(cards.first()).toBeVisible();
  expect(await cards.count()).toBeGreaterThan(0);
  await cards.first().click();
  await page.waitForURL(/\/providers\/[^/]+$/);
}

test.describe("browse → provider detail", () => {
  test("shows cards, opens a profile, renders its sections", async ({
    page,
  }) => {
    await openFirstProvider(page);

    // The three primary profile sections must render (About / Services /
    // Reviews) — the SpecSection headings + the review block heading.
    await expect(page.getByRole("heading", { name: "About" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Services & Rates" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /Reviews \(\d+\)/ }),
    ).toBeVisible();

    // The inquiry CTA (conversion goal) is present.
    await expect(
      page.getByRole("button", { name: "Send Inquiry" }),
    ).toBeVisible();

    await expectNoErrorBoundary(page);
  });

  // Mobile spot-check (#671): the same conversion flow at a phone viewport,
  // run by the mobile-chrome project.
  test("works on a mobile viewport @mobile", async ({ page }) => {
    await openFirstProvider(page);
    await expect(page.getByRole("heading", { name: "About" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Send Inquiry" }),
    ).toBeVisible();
    await expectNoErrorBoundary(page);
  });
});
