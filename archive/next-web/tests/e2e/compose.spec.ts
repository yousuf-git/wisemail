import { expect, test } from "@playwright/test";

import { fillCompose, mailWorkspace, uid } from "./helpers";

test("compose and send an email, then find it in Sent and Activity", async ({ page }) => {
  const ws = await mailWorkspace(page);
  const subject = `Hello from e2e ${uid("s")}`;
  const composer = await fillCompose(page, ws.slug, {
    to: "buyer@customer.test",
    subject,
    body: "Your order is on its way.",
  });
  await composer.getByRole("button", { name: "Send now" }).click();
  await expect(page.getByText(/sent|on its way/i).first()).toBeVisible({ timeout: 30_000 });

  await page.goto(`/${ws.slug}/inbox/sent`);
  const row = page.getByTestId("thread-row").filter({ hasText: subject });
  await expect(async () => {
    await page.reload();
    await expect(row).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 60_000 });

  await page.goto(`/${ws.slug}/activity`);
  await expect(page.getByText(subject).first()).toBeVisible({ timeout: 20_000 });
});

test("schedule an email, see it under Scheduled, then cancel it", async ({ page }) => {
  const ws = await mailWorkspace(page);
  const subject = `Scheduled from e2e ${uid("s")}`;
  const composer = await fillCompose(page, ws.slug, {
    to: "later@customer.test",
    subject,
    body: "See you tomorrow.",
  });

  await composer.getByRole("button", { name: /^Schedule/ }).first().click();
  await page.getByRole("menuitem", { name: /Tomorrow morning/ }).click();
  await expect(composer.getByTestId("scheduled-chip")).toBeVisible();
  await composer.getByRole("button", { name: "Schedule", exact: true }).click();

  await page.goto(`/${ws.slug}/scheduled`);
  const row = page.getByTestId("scheduled-row").filter({ hasText: subject });
  await expect(async () => {
    await page.reload();
    await expect(row).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 60_000 });

  await row.getByRole("button", { name: "Cancel send" }).click();
  const dialog = page.getByRole("dialog", { name: "Cancel this email?" });
  await dialog.getByRole("button", { name: "Cancel send" }).click();
  await expect(page.getByText("Canceled. It won't be sent.")).toBeVisible();
  await expect(row).toHaveCount(0, { timeout: 20_000 });
});
