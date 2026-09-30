import { expect, test } from "@playwright/test";

import {
  clickUntilVisible,
  connectResend,
  createSender,
  createWorkspace,
  seedEvent,
  seedInbound,
  uid,
  waitForSync,
} from "./helpers";

test("inbound mail reaches the inbox, gets a reply, and receipts arrive through the webhook", async ({
  page,
}) => {
  const { slug } = await createWorkspace(page, { plan: "pro" });
  const conn = await connectResend(page, slug);
  await waitForSync(page);
  const mailbox = await createSender(page, slug, conn.domain);

  // A customer writes in: signed webhook -> ingest -> job -> fetch body -> thread.
  const subject = `Where is my order ${uid("q")}`;
  await seedInbound(page, {
    connectionId: conn.id,
    apiKey: conn.key,
    from: "Jane Customer <jane@customer.test>",
    to: mailbox,
    subject,
    text: "Hi, my parcel has not arrived yet. Can you check?",
  });

  await page.goto(`/${slug}/inbox`);
  const row = page.getByTestId("thread-row").filter({ hasText: subject });
  await expect(async () => {
    await page.reload();
    await expect(row).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 60_000 });
  await expect(row).toHaveAttribute("data-unread", "true");

  // Open it: the body is there and the thread becomes read.
  await row.click();
  const message = page.getByTestId("message").first();
  await expect(message).toBeVisible();
  await expect(page.getByTestId("thread-view")).toContainText("Jane Customer");
  await expect(row).toHaveAttribute("data-unread", "false", { timeout: 15_000 });

  // Reply inline.
  await clickUntilVisible(
    page.getByRole("button", { name: /^Reply to/ }),
    page.getByTestId("inline-reply"),
  );
  const reply = page.getByTestId("inline-reply");
  await reply.getByRole("textbox").last().click();
  await page.keyboard.type("Thanks Jane, it ships tomorrow.");
  await reply.getByRole("button", { name: "Send now" }).click();
  await expect(page.getByText("Sent.", { exact: true })).toBeVisible({ timeout: 30_000 });

  // The reply shows up as our outbound message once the send job has run.
  await expect(async () => {
    await page.reload();
    await expect(page.getByTestId("message")).toHaveCount(2, { timeout: 3_000 });
  }).toPass({ timeout: 60_000 });
  await expect(page.getByTestId("thread-view")).toContainText("it ships tomorrow");

  // Receipts arrive as signed webhooks (what `pnpm webhook:test` posts) and fill the steps.
  const replySubject = `Re: ${subject}`;
  await seedEvent(page, { connectionId: conn.id, type: "email.sent", subject: replySubject });
  await seedEvent(page, { connectionId: conn.id, type: "email.delivered", subject: replySubject });
  await seedEvent(page, { connectionId: conn.id, type: "email.opened", subject: replySubject });
  const steps = page.getByTestId("receipt-steps").first();
  await expect(async () => {
    await page.reload();
    await expect(steps.locator('[data-step="delivered"]')).toBeVisible({ timeout: 3_000 });
    await expect(steps.locator('[data-step="opened"]')).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 60_000 });

  // Activity shows both directions with the opened status.
  await page.goto(`/${slug}/activity`);
  await expect(page.getByText(replySubject).first()).toBeVisible({ timeout: 20_000 });
});
