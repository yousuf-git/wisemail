import "server-only";

import { env } from "@/lib/env";

/**
 * The `/api/e2e/*` routes exist only for Playwright. They answer 404 unless the process is not
 * production AND `E2E=true` (and `parseEnv` refuses `E2E=true` in production outright), so no
 * deployed instance can expose them.
 */
export function e2eEnabled(): boolean {
  return env.NODE_ENV !== "production" && env.E2E === true;
}

export const e2eNotFound = () => new Response("Not found", { status: 404 });
