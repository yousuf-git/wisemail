import { organizationClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

/**
 * Same-origin Better Auth client (Vite proxies `/api` → Fastify).
 * Keep plugins lean on the SPA until roles/AC move into `@wisemail/shared`.
 */
export const authClient = createAuthClient({
  plugins: [organizationClient()],
});
