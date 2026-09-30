import { expect, test } from "@playwright/test";

import { clickUntilVisible, mailWorkspace, seedInbound, uid } from "./helpers";

test("trash a conversation, restore it, then delete it permanently", async ({ page }) => {
  const ws = await mailWorkspace(page);
  const subject = `Please delete ${uid("d")}`;
  await seedInbound(page, {
    connectionId: ws.conn.id,
    apiKey: ws.conn.key,
    from: "Old Friend <friend@customer.test>",
    to: ws.mailbox,
    subject,
    text: "Nothing important.",
  });

  await page.goto(`/${ws.slug}/inbox`);
  const row = page.getByTestId("thread-row").filter({ hasText: subject });
  await expect(async () => {
    await page.reload();
    await expect(row).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 60_000 });

  // Trash it from the open conversation.
  await row.click();
  await expect(page.getByTestId("message").first()).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("thread-view").getByRole("button", { name: /Trash/ }).click();
  // The row leaves the list optimistically; the toast confirms the server has it.
  await expect(page.getByText("Moved to Trash")).toBeVisible({ timeout: 30_000 });
  await expect(row).toHaveCount(0, { timeout: 20_000 });

  // It waits in Trash with a countdown, and can be restored.
  await page.goto(`/${ws.slug}/inbox/trash`);
  const trashed = page.getByTestId("thread-row").filter({ hasText: subject });
  await expect(trashed).toBeVisible({ timeout: 20_000 });
  await expect(trashed).toContainText(/Deletes permanently in/);
  await trashed.getByRole("button", { name: "Restore" }).click();
  await expect(trashed).toHaveCount(0, { timeout: 20_000 });
  await page.goto(`/${ws.slug}/inbox`);
  await expect(page.getByTestId("thread-row").filter({ hasText: subject })).toBeVisible();

  // Trash it again and delete permanently (Owner).
  await page.getByTestId("thread-row").filter({ hasText: subject }).click();
  await expect(page.getByTestId("message").first()).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("thread-view").getByRole("button", { name: /Trash/ }).click();
  // The row leaves the list optimistically; the toast confirms the server has it.
  await expect(page.getByText("Moved to Trash")).toBeVisible({ timeout: 30_000 });
  await page.goto(`/${ws.slug}/inbox/trash`);
  await expect(trashed).toBeVisible({ timeout: 20_000 });
  await clickUntilVisible(
    page.getByRole("button", { name: "Select" }),
    page.getByRole("checkbox").first(),
  );
  await page.getByRole("checkbox", { name: `Select ${subject}` }).check();
  await page.getByRole("button", { name: "Delete permanently" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Delete permanently" }).click();
  await expect(page.getByText(/Deleted .* permanently/)).toBeVisible({ timeout: 30_000 });
  await expect(trashed).toHaveCount(0, { timeout: 20_000 });
});
