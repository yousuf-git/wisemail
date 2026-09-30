import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

import { defineConfig, devices } from "@playwright/test";

/**
 * Chromium binary: PW_CHROMIUM_PATH, else any full Chromium under PLAYWRIGHT_BROWSERS_PATH
 * (sandbox images ship an older revision than the one this Playwright version wants), else
 * Playwright's own download (`pnpm exec playwright install chromium`, as CI does).
 */
function chromiumPath(): string | undefined {
  if (process.env.PW_CHROMIUM_PATH) return process.env.PW_CHROMIUM_PATH;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!root || !existsSync(root)) return undefined;
  const dir = readdirSync(root).find((d) => /^chromium-\d+$/.test(d));
  const bin = dir && path.join(root, dir, "chrome-linux", "chrome");
  return bin && existsSync(bin) ? bin : undefined;
}

const port = Number(process.env.E2E_PORT ?? 4200);
const inngestPort = Number(process.env.E2E_INNGEST_PORT ?? 8298);
const baseURL = `http://localhost:${port}`;
const ci = !!process.env.CI;

// Deterministic throwaway secrets: the e2e database is dropped at every start.
const appEnv = {
  NODE_ENV: "development",
  E2E: "true",
  PORT: String(port),
  MONGODB_URI:
    process.env.E2E_MONGODB_URI ?? "mongodb://127.0.0.1:27017/wisemail_e2e?replicaSet=rs0",
  BETTER_AUTH_SECRET: "e2e-secret-e2e-secret-e2e-secret-0000",
  BETTER_AUTH_URL: baseURL,
  APP_URL: baseURL,
  ENCRYPTION_KEK_CURRENT: Buffer.alloc(32, 9).toString("base64"),
  ENCRYPTION_KEK_ID: "e2e-1",
  RESEND_MODE: "fake",
  STORAGE_MODE: "fake",
  AI_MODE: "fake",
  BILLING_ENABLED: "false",
  INNGEST_DEV: "true",
  INNGEST_BASE_URL: `http://127.0.0.1:${inngestPort}`,
  NEXT_DIST_DIR: ".next-e2e",
  NEXT_TELEMETRY_DISABLED: "1",
  SENTRY_DSN: "",
};

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  workers: process.env.E2E_WORKERS ? Number(process.env.E2E_WORKERS) : ci ? 2 : 4,
  forbidOnly: ci,
  retries: ci ? 1 : 0,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  reporter: ci ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    launchOptions: { executablePath: chromiumPath() },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      // Local Inngest dev server so jobs (sync, send, process-event, alerts, ...) really run.
      command: `npx --yes inngest-cli@latest dev --port ${inngestPort} -u ${baseURL}/api/inngest --no-discovery --connect-gateway-port ${inngestPort + 1} --connect-executor-grpc-port 50153 --connect-gateway-grpc-port 50152`,
      url: `http://127.0.0.1:${inngestPort}`,
      reuseExistingServer: !!process.env.E2E_REUSE,
      timeout: 120_000,
    },
    {
      // Fresh database, then a dev server (the seed routes refuse to run in production builds).
      command: `pnpm exec tsx scripts/e2e-prepare.ts && pnpm exec next dev -p ${port}`,
      url: `${baseURL}/sign-in`,
      env: appEnv,
      reuseExistingServer: !!process.env.E2E_REUSE,
      timeout: 180_000,
      stdout: "pipe",
      stderr: "pipe",
    },
  ],
});
