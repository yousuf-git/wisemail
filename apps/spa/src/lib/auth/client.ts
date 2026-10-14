import { emailOTPClient, organizationClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

import { apiBase } from "@/lib/api-base";

/**
 * Better Auth client. Dev: same-origin (Vite proxies `/api` → Fastify).
 * Prod: `VITE_API_URL` points at the OCI API (`BETTER_AUTH_URL`).
 */
export const authClient = createAuthClient({
  baseURL: apiBase() || undefined,
  plugins: [organizationClient(), emailOTPClient()],
});
