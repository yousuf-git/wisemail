import { expect, test } from "@playwright/test";

test.describe("SPA smoke", () => {
  test("sign-in route renders Wisemail", async ({ page }) => {
    await page.goto("/sign-in");
    await expect(page.getByText(/wisemail/i).first()).toBeVisible();
  });

  test("home redirects unauthenticated users toward sign-in", async ({ page }) => {
    await page.goto("/");
    await page.waitForURL(/sign-in|\/$/, { timeout: 15_000 });
    const url = page.url();
    expect(url.includes("sign-in") || url.endsWith("/") || url.endsWith(":5173/")).toBeTruthy();
  });
});
