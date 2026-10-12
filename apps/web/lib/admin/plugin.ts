import "server-only";

import type { BetterAuthPlugin } from "better-auth";
import { admin } from "better-auth/plugins";

import { env } from "@/lib/env";
import { hasAdminRole, isAllowlisted, ADMIN_ROLE } from "./allowlist";

/** Impersonation sessions last one hour (Better Auth default, stated so it is visible). */
export const IMPERSONATION_SECONDS = 60 * 60;

/**
 * Promotes allowlisted users when a session is created for them. A session only exists after the
 * address is verified (sign-up creates none), so this never promotes an unverified address.
 */
function allowlistPromotion(): BetterAuthPlugin {
  return {
    id: "platform-admin-allowlist",
    init() {
      return {
        options: {
          databaseHooks: {
            session: {
              create: {
                async before(session, ctx) {
                  if (!ctx || !env.PLATFORM_ADMIN_EMAILS) return;
                  if ((session as { impersonatedBy?: string }).impersonatedBy) return;
                  const user = await ctx.context.internalAdapter.findUserById(session.userId);
                  if (!user || !user.emailVerified) return;
                  const role = (user as { role?: string | null }).role;
                  if (hasAdminRole(role) || !isAllowlisted(user.email, env.PLATFORM_ADMIN_EMAILS)) {
                    return;
                  }
                  await ctx.context.internalAdapter.updateUser(user.id, { role: ADMIN_ROLE });
                },
              },
            },
          },
        },
      };
    },
  };
}

/**
 * Better Auth `admin` plugin (ban, sessions, impersonation). The default `admin` role may
 * impersonate users but not other admins (no `impersonate-admins`). Kept as its own typed
 * export so `auth.api.banUser` and friends stay typed.
 */
export const platformAdminPlugin = () =>
  admin({
    impersonationSessionDuration: IMPERSONATION_SECONDS,
    bannedUserMessage:
      "This account has been suspended. Contact Wisemail support if you think this is a mistake.",
  });

export const platformAdminAllowlistPlugin = allowlistPromotion;
