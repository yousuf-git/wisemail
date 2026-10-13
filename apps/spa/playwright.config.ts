import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig, devices } from "@playwright/test";

const spaRoot = path.dirname(fileURLToPath(import.meta.url));

/**
 * SPA smoke e2e (M8b). Reuses Chromium resolution from the web app's Playwright install.
 * Run: `pnpm test:e2e:spa` (starts Vite preview + expects API on :4000, or set SPA_E2E_API).
 */
function chromiumPath(): string | undefined {
  if (process.env.PW_CHROMIUM_PATH) return process.env.PW_CHROMIUM_PATH;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!root || !existsSync(root)) return undefined;
  const dir = readdirSync(root).find((d) => /^chromium-\d+$/.test(d));
  const bin = dir && path.join(root, dir, "chrome-linux", "chrome");
  return bin && existsSync(bin) ? bin : undefined;
}

const port = Number(process.env.SPA_E2E_PORT ?? 5173);
const baseURL = `http://127.0.0.1:${port}`;
const apiProxy = process.env.SPA_E2E_API ?? "http://127.0.0.1:4000";
const ci = !!process.env.CI;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  workers: 1,
  forbidOnly: ci,
  retries: ci ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: ci ? [["github"], ["list"]] : [["list"]],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    launchOptions: { executablePath: chromiumPath() },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    cwd: spaRoot,
    command: `pnpm build && pnpm exec vite preview --host 127.0.0.1 --port ${port}`,
    url: baseURL,
    reuseExistingServer: !!process.env.SPA_E2E_REUSE,
    timeout: 180_000,
    env: {
      ...process.env,
      VITE_API_PROXY: apiProxy,
    },
  },
});
