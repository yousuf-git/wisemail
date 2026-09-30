import { expect, test } from "@playwright/test";

import {
  clickUntilVisible,
  createWorkspace,
  newAccount,
  newSession,
  outboxLink,
  signUp,
  verifyFromOutbox,
} from "./helpers";

test("invite a member, accept in a second browser session, see them in the list and the audit log", async ({
  page,
  browser,
}) => {
  const owner = await createWorkspace(page, { plan: "team" });
  const invitee = newAccount("invitee");

  await page.goto(`/${owner.slug}/settings/members`);
  await clickUntilVisible(
    page.getByRole("button", { name: "Invite member" }),
    page.getByRole("heading", { name: "Invite a member" }),
  );
  await page.getByLabel("Email").fill(invitee.email);
  await page.getByRole("button", { name: "Create invite link" }).click();
  await expect(page.getByRole("button", { name: "Copy link" })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByTestId(`invite-${invitee.email}`)).toBeVisible();

  // The invitation "email" lands in the dev outbox with the invite link.
  const inviteLink = await outboxLink(page, invitee.email, "invitation");
  expect(new URL(inviteLink).pathname).toMatch(/^\/invite\//);

  // A different person, in a different browser session, signs up from the invite and accepts.
  const second = await newSession(browser);
  try {
    const guest = second.page;
    await guest.goto(inviteLink);
    await expect(guest.getByRole("heading", { name: /^Join / })).toBeVisible();
    await guest.getByRole("link", { name: "Create an account" }).click();
    await signUp(guest, invitee, new URL(inviteLink).pathname);
    await verifyFromOutbox(guest, invitee.email, "verify-email");
    await guest.waitForURL(/\/invite\//);
    await clickUntilVisible(
      guest.getByRole("button", { name: "Accept invitation" }),
      guest.getByText("Joining…"),
    ).catch(() => {});
    await guest.waitForURL(new RegExp(`/${owner.slug}(/|$)`), { timeout: 30_000 });
    await expect(guest.getByRole("link", { name: "Inbox" }).first()).toBeVisible();
    // A viewer sees the workspace but cannot invite anyone.
    await guest.goto(`/${owner.slug}/settings/members`);
    await expect(guest.getByRole("button", { name: "Invite member" })).toHaveCount(0);
  } finally {
    await second.context.close();
  }

  // Back as the owner: the member is listed and the audit log recorded the invitation.
  await page.goto(`/${owner.slug}/settings/members`);
  await expect(page.getByTestId(`member-${invitee.email}`)).toBeVisible();

  await page.goto(`/${owner.slug}/settings/audit-log`);
  const rows = page.getByTestId("audit-row");
  await expect(rows.first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("audit-list")).toContainText(/invit/i);
});

test("an invitation for another address is refused with a clear message", async ({
  page,
  browser,
}) => {
  const owner = await createWorkspace(page, { plan: "pro" });
  const invitee = newAccount("invitee");
  await page.goto(`/${owner.slug}/settings/members`);
  await clickUntilVisible(
    page.getByRole("button", { name: "Invite member" }),
    page.getByRole("heading", { name: "Invite a member" }),
  );
  await page.getByLabel("Email").fill(invitee.email);
  await page.getByRole("button", { name: "Create invite link" }).click();
  await expect(page.getByRole("button", { name: "Copy link" })).toBeVisible({ timeout: 20_000 });
  const inviteLink = await outboxLink(page, invitee.email, "invitation");

  // Somebody else (verified, signed in) opens the link.
  const second = await newSession(browser);
  try {
    await createWorkspace(second.page);
    await second.page.goto(inviteLink);
    await expect(second.page.getByRole("heading", { name: "Wrong account" })).toBeVisible();
    await expect(second.page.getByRole("button", { name: "Accept invitation" })).toHaveCount(0);
  } finally {
    await second.context.close();
  }
});
