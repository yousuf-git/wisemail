import { expect, test } from "@playwright/test";

import {
  expectNoSeriousA11y,
  newAccount,
  outboxCode,
  signIn,
  signUp,
  typeCode,
  uid,
  verifyFromOutbox,
} from "./helpers";

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

  await page.waitForURL(
    (url) => url.pathname.split("/").length === 2 && !/onboarding/.test(url.pathname),
  );
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

test("verify the email with the 6-digit code instead of the link", async ({ page }) => {
  const account = newAccount();
  await signUp(page, account);
  await expect(page).toHaveURL(/verify-email/);

  // A wrong code is refused in place, the boxes clear and stay usable.
  await typeCode(page, "000000");
  await expect(page.getByText(/doesn't match|too many/i)).toBeVisible();
  await expect(page.getByLabel("Digit 1 of 6")).toHaveValue("");

  const code = await outboxCode(page, account.email, "verify-email");
  await typeCode(page, code);
  await expect(page).toHaveURL(/onboarding/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: /^Welcome, Sam/ })).toBeVisible();
});

test("a pasted code fills every box", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]).catch(() => {});
  const account = newAccount();
  await signUp(page, account);
  const code = await outboxCode(page, account.email, "verify-email");
  await page.getByLabel("Digit 1 of 6").click();
  await page.evaluate((text) => {
    const target = document.activeElement as HTMLInputElement;
    const data = new DataTransfer();
    data.setData("text", text);
    target.dispatchEvent(
      new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }),
    );
  }, code);
  await expect(page).toHaveURL(/onboarding/, { timeout: 30_000 });
});

test("forgot password: request, enter the code, choose a new password, sign in", async ({
  page,
}) => {
  const account = newAccount();
  await signUp(page, account);
  await verifyFromOutbox(page, account.email, "verify-email");
  await page.context().clearCookies();

  await page.goto("/forgot-password");
  await page.getByRole("textbox", { name: "Email" }).fill(account.email);
  await page.getByRole("button", { name: "Send code and link" }).click();
  await expect(page.getByTestId("reset-sent")).toBeVisible();
  await expect(page).toHaveURL(/reset-password\?email=/);

  const code = await outboxCode(page, account.email, "reset-password");
  await typeCode(page, code);
  const fresh = "Fresh-Start-9-secure";
  await page.getByLabel("New password").fill(fresh);
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page).toHaveURL(/sign-in\?reset=1/);
  await expect(page.getByText("Password updated.")).toBeVisible();

  await signIn(page, { ...account, password: fresh });
  await expect(page).toHaveURL(/onboarding/, { timeout: 30_000 });
});

test("forgot password answers the same for an address with no account", async ({ page }) => {
  await page.goto("/forgot-password");
  await page.getByRole("textbox", { name: "Email" }).fill(`${uid("ghost")}@example.com`);
  await page.getByRole("button", { name: "Send code and link" }).click();
  await expect(page).toHaveURL(/reset-password\?email=/);
  await expect(page.getByTestId("reset-sent")).toContainText("If there's an account for");
});

test("password field: show/hide, strength hint, and no social buttons without providers", async ({
  page,
}) => {
  await page.goto("/sign-up");
  const password = page.getByLabel("Password", { exact: true });
  await password.fill("abc");
  await expect(page.getByTestId("password-strength")).toContainText("Too short");
  await password.fill("Tulip-Field-9-Garden!");
  await expect(page.getByTestId("password-strength")).toContainText("Strong");
  await expect(password).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: "Show password" }).click();
  await expect(password).toHaveAttribute("type", "text");
  await expect(page.getByTestId("social-buttons")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/terms");
  await expect(page.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute(
    "href",
    "/privacy",
  );
});

test("auth pages have no serious accessibility problems and no sideways scroll at 390px", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of [
    "/sign-in",
    "/sign-up",
    "/forgot-password",
    "/reset-password?email=a%40b.co",
    "/verify-email?email=a%40b.co",
  ]) {
    await page.goto(path);
    await expect(page.locator("h1")).toBeVisible();
    await expectNoSeriousA11y(page, path);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `${path} scrolls sideways`).toBeLessThanOrEqual(1);
  }
});
