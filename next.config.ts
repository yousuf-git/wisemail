import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";

const release = process.env.SENTRY_RELEASE || process.env.VERCEL_GIT_COMMIT_SHA || undefined;

const nextConfig: NextConfig = {
  // Playwright runs its own dev server in a separate folder so it never fights `pnpm dev`/`pnpm build`.
  distDir: process.env.NEXT_DIST_DIR || undefined,
  // Inlined into the client bundle for instrumentation-client.ts (the DSN is public by design).
  env: {
    NEXT_PUBLIC_SENTRY_DSN: process.env.SENTRY_DSN ?? "",
    NEXT_PUBLIC_SENTRY_RELEASE: release ?? "",
  },
};

// Source maps are uploaded only when an auth token is present; otherwise the config is untouched
// (Sentry itself is initialised in instrumentation*.ts and stays off without SENTRY_DSN).
export default process.env.SENTRY_AUTH_TOKEN
  ? withSentryConfig(nextConfig, {
      authToken: process.env.SENTRY_AUTH_TOKEN,
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      release: { name: release },
      silent: !process.env.CI,
      telemetry: false,
      widenClientFileUpload: true,
    })
  : nextConfig;
