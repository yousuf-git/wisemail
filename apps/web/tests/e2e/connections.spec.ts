import { expect, test } from "@playwright/test";

import { clickUntilVisible, connectResend, createWorkspace, openConnectDialog, seedInbound, uid } from "./helpers";

test("connect a fake Resend account, watch it sync, read the checklist", async ({ page }) => {
  const { slug } = await createWorkspace(page);
  const conn = await connectResend(page, slug);

  await expect(page.getByRole("heading", { name: conn.name }).first()).toBeVisible();

  // The initial sync job runs through the local Inngest dev server and settles.
  await expect(page.getByTestId("sync-status")).toContainText(/Synced/, { timeout: 60_000 });

  const checklist = page.getByTestId("checklist");
  await expect(checklist).toBeVisible();

  // The mirror was filled from Resend (the fake team ships with domains).
  await expect(page.getByTestId("count-domains")).not.toHaveText("0");

  // The webhook is registered but nothing has arrived yet: "needs a look", with a plain hint.
  await expect(page.getByTestId("checklist-webhook")).toHaveAttribute("data-status", "warn");
  await expect(page.getByTestId("checklist-webhook")).toContainText(/no event has arrived/i);

  // The first signed event through the real ingest route turns it green.
  const domain = `${conn.team}.example.com`;
  await seedInbound(page, {
    connectionId: conn.id,
    apiKey: conn.key,
    from: "jane@customer.test",
    to: `support@${domain}`,
    subject: "First event",
  });
  // The checklist is recomputed by a sync (and by fixes), so ask for one.
  await clickUntilVisible(
    page.getByRole("button", { name: "Sync now" }),
    page.getByText(/Syncing|Synced/).first(),
  );
  await expect(async () => {
    await page.reload();
    await expect(page.getByTestId("checklist-webhook")).toHaveAttribute("data-status", "ok", {
      timeout: 2_000,
    });
  }).toPass({ timeout: 45_000 });

  // Back on the list the connection is active.
  await page.goto(`/${slug}/settings/connections`);
  await expect(page.getByText(conn.name).first()).toBeVisible();
  await expect(page.getByTestId("connection-quota")).toBeVisible();
});

test("the same Resend account cannot be connected twice", async ({ page }) => {
  const { slug } = await createWorkspace(page, { plan: "pro" });
  const first = await connectResend(page, slug);

  await openConnectDialog(page, slug);
  await page.getByLabel("Name").fill("Same again");
  await page.getByLabel("Full access API key").fill(`re_${first.team}_full`);
  await page.getByRole("button", { name: "Connect account" }).click();
  await expect(page.getByText(/already connected/i).first()).toBeVisible();
});

test("a sending-only key is rejected with an explanation", async ({ page }) => {
  const { slug } = await createWorkspace(page);
  await openConnectDialog(page, slug);
  await page.getByLabel("Name").fill("Sending only");
  await page.getByLabel("Full access API key").fill(`re_${uid("s")}_sending`);
  await page.getByRole("button", { name: "Connect account" }).click();
  await expect(page.getByText(/can only send email/i).first()).toBeVisible();
});
