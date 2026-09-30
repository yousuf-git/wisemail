import { expect, test } from "@playwright/test";

import {
  clickUntilVisible,
  fillCompose,
  mailWorkspace,
  seedEvent,
  uid,
} from "./helpers";

test("an alert rule opens an incident and notifies through the bell", async ({ page }) => {
  const ws = await mailWorkspace(page);

  // 1. A rule from the "Any spam complaint" preset.
  await page.goto(`/${ws.slug}/alerts`);
  await clickUntilVisible(
    page.getByRole("button", { name: /New rule|Create a rule|Add rule/i }).first(),
    page.getByRole("heading", { name: "New alert rule" }),
  );
  await page.getByRole("button", { name: "Any spam complaint" }).click();
  await page.getByRole("button", { name: /^(Create|Save)/ }).click();
  await expect(page.getByTestId("rule-Any spam complaint")).toBeVisible({ timeout: 20_000 });

  // 2. Send an email and let Resend report a complaint about it (signed webhook, real ingest path).
  const subject = `Alert me ${uid("a")}`;
  const composer = await fillCompose(page, ws.slug, {
    to: "grumpy@customer.test",
    subject,
    body: "This one will get reported.",
  });
  await composer.getByRole("button", { name: "Send now" }).click();
  await expect(page.getByText(/sent|on its way/i).first()).toBeVisible({ timeout: 30_000 });
  await expect(async () => {
    const res = await page.request.post("/api/e2e/seed", {
      data: { kind: "event", connectionId: ws.conn.id, type: "email.sent", subject },
    });
    expect(res.ok()).toBeTruthy();
  }).toPass({ timeout: 60_000 });
  await seedEvent(page, { connectionId: ws.conn.id, type: "email.complained", subject });

  // 3. The incident opens, and the notification shows in the bell.
  await page.goto(`/${ws.slug}/alerts`);
  const incident = page.getByTestId("incident-row").first();
  await expect(async () => {
    await page.reload();
    await expect(incident).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 90_000 });
  await expect(incident).toContainText(/spam complaint/i);

  await expect(page.getByTestId("notification-count")).toBeVisible({ timeout: 20_000 });
  await page.goto(`/${ws.slug}/notifications`);
  await expect(page.getByTestId("notification-row").first()).toBeVisible();
});
