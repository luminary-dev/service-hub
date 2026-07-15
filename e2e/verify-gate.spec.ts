import { expect, test, type Page } from "@playwright/test";
import { ACCOUNTS, login, registerCustomer } from "./helpers";

const CARD = 'a[href*="/providers/"]';

// The exact gate copy (src/lib/i18n.ts → verify.inquiryPrompt / reviewPrompt),
// surfaced by EmailVerifyBanner inside the inquiry form and review section.
const INQUIRY_GATE = "Verify your email address to contact a provider.";
const REVIEW_GATE = "Verify your email address to leave a review.";

async function openFirstProvider(page: Page) {
  await page.goto("/providers");
  const cards = page.locator(CARD);
  await expect(cards.first()).toBeVisible();
  await cards.first().click();
  await page.waitForURL(/\/providers\/[^/]+$/);
}

test.describe("verified-email gate (#115)", () => {
  test("blocks an unverified customer from inquiring or reviewing", async ({
    page,
  }) => {
    // A freshly registered customer is signed in but email-UNVERIFIED.
    await registerCustomer(page);
    await openFirstProvider(page);

    // Inquiry form: the gate prompt is shown and the submit is disabled, so the
    // user can't POST into a backend 403.
    await expect(page.getByText(INQUIRY_GATE)).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Send Inquiry" }),
    ).toBeDisabled();

    // Review section: the same gate blocks leaving a review.
    await expect(page.getByText(REVIEW_GATE)).toBeVisible();
  });

  test("lets a verified customer inquire (happy path)", async ({ page }) => {
    await login(page, ACCOUNTS.verifiedCustomer);
    await openFirstProvider(page);

    // No gate prompt, and the inquiry CTA is enabled.
    await expect(page.getByText(INQUIRY_GATE)).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Send Inquiry" }),
    ).toBeEnabled();
  });
});
