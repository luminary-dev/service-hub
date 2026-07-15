import { expect, test } from "@playwright/test";
import { ACCOUNTS, expectNoErrorBoundary, login } from "./helpers";

test.describe("customer registration form", () => {
  test("blocks submit and shows inline errors on an empty form", async ({
    page,
  }) => {
    await page.goto("/register/customer");
    await page.getByRole("button", { name: "Create account" }).click();

    // Client-side validation (#378) fires before any network call: we stay on
    // the form, the email control is flagged invalid and its error is
    // announced via role="alert".
    await expect(page).toHaveURL(/\/register\/customer$/);
    await expect(page.locator("#reg-email")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    await expect(page.getByRole("alert").first()).toBeVisible();
  });

  test("rejects a malformed email", async ({ page }) => {
    await page.goto("/register/customer");
    await page.fill("#reg-name", "Valid Name");
    await page.fill("#reg-email", "not-an-email");
    await page.fill("#reg-phone", "0770000001");
    await page.fill("#reg-password", "e2e-playwright-pass-9x");
    await page.locator("#reg-agree").check();
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(page).toHaveURL(/\/register\/customer$/);
    await expect(page.locator("#reg-email")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });
});

test.describe("login", () => {
  test("signs in a seeded account and reaches an authed page", async ({
    page,
  }) => {
    await login(page, ACCOUNTS.verifiedCustomer);

    // The session cookie now works: the customer account page renders its own
    // content (proving the authed SSR path, not the error boundary).
    await page.goto("/account");
    await expect(
      page.getByRole("heading", { name: "My account" }),
    ).toBeVisible();
    await expectNoErrorBoundary(page);
  });
});
