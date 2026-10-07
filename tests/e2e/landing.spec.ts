import { expect, test } from "@playwright/test";

import { expectNoSeriousA11y } from "./helpers";

// Public marketing pages: no workspace needed.
for (const [label, viewport] of [
  ["desktop", { width: 1280, height: 800 }],
  ["phone", { width: 390, height: 844 }],
] as const) {
  test.describe(`landing ${label}`, () => {
    // Reduced motion shows final states at once, so axe measures colours, not a fade in progress.
    test.use({ viewport, reducedMotion: "reduce" });

    test("loads, links to sign-up and sign-in, does not scroll sideways, and is accessible", async ({
      page,
    }) => {
      await page.goto("/");
      await expect(page.getByRole("heading", { level: 1, name: /See who/ })).toBeVisible();
      await expect(page).toHaveTitle(/Wisemail/);
      await expect(page.locator('meta[property="og:title"]')).toHaveCount(1);

      const hero = page.getByRole("link", { name: /Start free/ }).first();
      await expect(hero).toHaveAttribute("href", "/sign-up");
      await expect(page.getByRole("link", { name: "Get started" }).first()).toHaveAttribute(
        "href",
        "/sign-up",
      );

      // Scroll through so scroll-reveal content is in, then let the motion settle.
      const height = await page.evaluate(() => document.documentElement.scrollHeight);
      for (let y = 0; y < height; y += 500) {
        await page.evaluate((top) => window.scrollTo(0, top), y);
        await page.waitForTimeout(80);
      }
      await page.waitForTimeout(4200);
      await page.evaluate(() => window.scrollTo(0, 0));

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(1);

      await expectNoSeriousA11y(page, `landing ${label}`);

      await page.goto("/pricing");
      await page.getByRole("radio", { name: "Annual" }).click();
      await expect(page.getByTestId("price-pro")).toHaveText("$10");
    });
  });
}
