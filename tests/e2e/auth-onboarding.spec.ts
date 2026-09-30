import { expect, test } from "@playwright/test";

import { newAccount, signIn, signUp, uid, verifyFromOutbox } from "./helpers";

test("sign up, verify through the dev outbox, onboard into a workspace", async ({ page }) => {
  const account = newAccount();
  await signUp(page, account);

  // Unverified accounts cannot get in.
  await page.goto("/onboarding");
  await expect(page).toHaveURL(/sign-in/);

  await verifyFromOutbox(page, account.email, "verify-email");
  await expect(page).toHaveURL(/onboarding/);
  await expect(page.getByRole("heading", { name: /^Welcome, Sam/ })).toBeVisible();

  const name = `Bakery ${uid("w")}`;
  await page.getByLabel("Workspace name").fill(name);
  await expect(page.getByText("Nice, that one's free.")).toBeVisible();
  await page.getByRole("button", { name: "Create workspace" }).click();

  await page.waitForURL((url) => url.pathname.split("/").length === 2 && !/onboarding/.test(url.pathname));
  await expect(page.getByRole("link", { name: "Inbox" }).first()).toBeVisible();
  await expect(page.getByText(/Let's connect your first Resend account/)).toBeVisible();

  // A returning person signs in and lands straight in the workspace.
  await page.context().clearCookies();
  await signIn(page, account);
  await expect(page.getByRole("link", { name: "Inbox" }).first()).toBeVisible();
});

test("wrong password is refused with a friendly message", async ({ page }) => {
  const account = newAccount();
  await signUp(page, account);
  await verifyFromOutbox(page, account.email, "verify-email");
  await page.context().clearCookies();
  await signIn(page, { ...account, password: "not-the-password-1" });
  await expect(page.getByRole("alert").first()).toBeVisible();
  await expect(page).toHaveURL(/sign-in/);
});

test("protected pages send visitors to sign in", async ({ page }) => {
  await page.goto("/some-org/inbox");
  await expect(page).toHaveURL(/sign-in\?next=/);
});
