import { devices, expect, test } from "@playwright/test";

import {
  clickUntilVisible,
  connectResend,
  createWorkspace,
  expectNoSeriousA11y,
  waitForSync,
} from "./helpers";

// One shared workspace per file would race between workers, so each test signs up its own.

test.describe("mobile smoke", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    userAgent: devices["iPhone 13"].userAgent,
    hasTouch: true,
    isMobile: true,
  });

  test("the app is usable at phone width: no sideways scroll, menu opens, pages load", async ({
    page,
  }) => {
    const ws = await createWorkspace(page, { plan: "pro" });

    const noSidewaysScroll = async (label: string) => {
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${label} scrolls sideways by ${overflow}px`).toBeLessThanOrEqual(1);
    };

    await expect(page.getByText(/Let's connect your first Resend account/)).toBeVisible();
    await noSidewaysScroll("overview");

    // The sidebar becomes a sheet behind the menu button.
    await clickUntilVisible(
      page.getByRole("button", { name: "Open menu" }),
      page.getByRole("dialog").getByRole("link", { name: "Inbox" }),
    );
    await page.getByRole("dialog").getByRole("link", { name: "Inbox" }).click();
    await page.waitForURL(/\/inbox/);
    // Folders once an account is connected; this user has none, so the empty state instead.
    await expect(
      page
        .getByRole("navigation", { name: "Mail folders" })
        .or(page.getByRole("link", { name: "Connect an account" })),
    ).toBeVisible();
    await noSidewaysScroll("inbox");

    for (const path of ["activity", "insights", "alerts", "settings/connections", "compose"]) {
      await page.goto(`/${ws.slug}/${path}`);
      await expect(page.locator("main, [role=main], #main").first()).toBeVisible();
      await noSidewaysScroll(path);
    }

    // Connect from the phone too.
    const conn = await connectResend(page, ws.slug);
    await waitForSync(page);
    await noSidewaysScroll(`connection ${conn.name}`);
  });
});

test.describe("accessibility smoke (axe, serious and critical fail)", () => {
  test("public and signed-in pages have no serious violations", async ({ page }) => {
    test.setTimeout(300_000);
    for (const path of ["/", "/sign-in", "/sign-up", "/forgot-password"]) {
      await page.goto(path);
      await expect(page.locator("body")).toBeVisible();
      await expectNoSeriousA11y(page, path);
    }

    const ws = await createWorkspace(page, { plan: "team" });
    const conn = await connectResend(page, ws.slug);
    await waitForSync(page);
    expect(conn.id).toBeTruthy();

    const pages = [
      "",
      "inbox",
      "scheduled",
      "activity",
      "compose",
      "insights",
      "alerts",
      "domains",
      "api-keys",
      "audience/contacts",
      "broadcasts",
      "templates",
      "settings/connections",
      "settings/members",
      "settings/senders",
      "settings/usage",
      "settings/billing",
      "settings/audit-log",
    ];
    for (const path of pages) {
      await page.goto(`/${ws.slug}${path ? `/${path}` : ""}`);
      await expect(page.locator("main, [role=main], #main").first()).toBeVisible();
      // Let client data and entrance animations settle before scanning.
      await page.waitForLoadState("networkidle").catch(() => {});
      await expectNoSeriousA11y(page, `/${path}`);
    }
  });
});
