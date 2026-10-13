import "server-only";

import { betterAuth } from "better-auth";
import type { BetterAuthPlugin } from "better-auth";
import { APIError } from "better-auth/api";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { emailOTP, organization } from "better-auth/plugins";
import { Types } from "mongoose";

import { getMongoClient } from "@/lib/db/connect";
import { withTransaction } from "@/lib/db/transaction";
import { env } from "@/lib/env";
import { createOrgSchema } from "@/lib/validation/org";
import { provisionOrganization } from "@/lib/services/org-settings";
import { applyInvitationScope, clearMemberScope } from "@/lib/services/project-scope";
import { deleteTourProgress } from "@/lib/tours/progress";
import { getEntitlements } from "@/lib/billing/entitlements";
import { stripePlugin } from "@/lib/billing/stripe-plugin";
import { sendPasswordResetEmail, sendVerificationEmail } from "@/lib/services/system-email";
import { platformAdminAllowlistPlugin, platformAdminPlugin } from "@/lib/admin/plugin";
import { ac, roles } from "./permissions";
import { OTP_ALLOWED_ATTEMPTS, OTP_EXPIRES_IN, OTP_LENGTH } from "./otp-config";
import { enabledSocialProviders } from "./social";

type OtpType = "email-verification" | "forget-password";

/** A failed system email must not fail sign-up or sign-in; the person can ask for a new one. */
async function mailSafely(what: string, send: () => Promise<void>) {
  try {
    await send();
  } catch (error) {
    console.error(`[auth] could not send the ${what} email`, error);
  }
}

/**
 * Builds the Better Auth instance. Next.js passes `nextCookies()` as a trailing plugin; Fastify
 * omits it and serves the handler through `toNodeHandler` instead.
 */
export function createAuth(options: { trailingPlugins?: BetterAuthPlugin[] } = {}) {
  const client = getMongoClient();
  const social = enabledSocialProviders();

  // Hold the instance so OTP helpers can call into it after construction (same pattern as before).
  const box: { auth?: ReturnType<typeof build> } = {};

  const issueOtp = (args: { body: { email: string; type: OtpType } }): Promise<string> =>
    box.auth!.api.createVerificationOTP(args);

  async function getUserName(email: string): Promise<string | null> {
    const found = await (
      await box.auth!.$context
    ).internalAdapter.findUserByEmail(email.toLowerCase());
    return found ? found.user.name : null;
  }

  function build() {
    return betterAuth({
      appName: "Wisemail",
      baseURL: env.BETTER_AUTH_URL,
      secret: env.BETTER_AUTH_SECRET,
      // SPA (Vite :5173) + Next (:3000) during M7; production keeps APP_URL / BETTER_AUTH_URL.
      trustedOrigins: [
        env.APP_URL,
        env.BETTER_AUTH_URL,
        "http://localhost:5173",
        "http://127.0.0.1:5173",
      ].filter((v, i, a) => a.indexOf(v) === i),
      // Local SPA (:5173) + API (:4000) need Lax cookies over http; Secure only on https.
      advanced: {
        defaultCookieAttributes: {
          sameSite: "lax",
          secure: env.BETTER_AUTH_URL.startsWith("https://"),
          path: "/",
        },
      },
      database: mongodbAdapter(client.db(), { client, transaction: true }),
      emailAndPassword: {
        enabled: true,
        minPasswordLength: 8,
        requireEmailVerification: true,
        resetPasswordTokenExpiresIn: 60 * 60,
        revokeSessionsOnPasswordReset: true,
        sendResetPassword: async ({ user, url }) => {
          await mailSafely("password reset", async () => {
            const code = await issueOtp({ body: { email: user.email, type: "forget-password" } });
            await sendPasswordResetEmail(user.email, { name: user.name, url, code });
          });
        },
      },
      emailVerification: {
        sendOnSignUp: true,
        sendOnSignIn: true,
        autoSignInAfterVerification: true,
        expiresIn: 60 * 60,
        sendVerificationEmail: async ({ user, url }) => {
          await mailSafely("verification", async () => {
            const code = await issueOtp({
              body: { email: user.email, type: "email-verification" },
            });
            await sendVerificationEmail(user.email, { name: user.name, url, code });
          });
        },
      },
      socialProviders: {
        ...(social.includes("google")
          ? {
              google: {
                clientId: env.GOOGLE_CLIENT_ID!,
                clientSecret: env.GOOGLE_CLIENT_SECRET!,
              },
            }
          : {}),
        ...(social.includes("github")
          ? {
              github: {
                clientId: env.GITHUB_CLIENT_ID!,
                clientSecret: env.GITHUB_CLIENT_SECRET!,
              },
            }
          : {}),
      },
      account: {
        accountLinking: {
          enabled: true,
          trustedProviders: ["google", "github"],
          requireLocalEmailVerified: true,
        },
      },
      rateLimit: { storage: "database" },
      plugins: [
        emailOTP({
          otpLength: OTP_LENGTH,
          expiresIn: OTP_EXPIRES_IN,
          allowedAttempts: OTP_ALLOWED_ATTEMPTS,
          disableSignUp: true,
          storeOTP: "hashed",
          rateLimit: { window: 60, max: 5 },
          sendVerificationOTP: async ({ email, otp, type }) => {
            if (type !== "email-verification" && type !== "forget-password") return;
            const user = await getUserName(email);
            if (user === null) return;
            await mailSafely("one-time code", () =>
              type === "email-verification"
                ? sendVerificationEmail(email, { name: user, code: otp })
                : sendPasswordResetEmail(email, { name: user, code: otp }),
            );
          },
        }),
        organization({
          ac,
          roles,
          creatorRole: "owner",
          requireEmailVerificationOnInvitation: true,
          invitationExpiresIn: 7 * 24 * 60 * 60,
          membershipLimit: async (_user, org) => {
            const e = await getEntitlements(new Types.ObjectId(org.id));
            return e.limits.members ?? Number.MAX_SAFE_INTEGER;
          },
          organizationHooks: {
            afterAcceptInvitation: async ({ invitation, member }) => {
              await applyInvitationScope({
                invitationId: invitation.id,
                orgId: invitation.organizationId,
                memberId: member.id,
                role: member.role,
              });
            },
            afterRemoveMember: async ({ member, organization: org }) => {
              await clearMemberScope(new Types.ObjectId(org.id), new Types.ObjectId(member.id));
              await deleteTourProgress(
                new Types.ObjectId(org.id),
                new Types.ObjectId(member.userId),
              );
            },
            beforeCreateOrganization: async ({ organization: org }) => {
              const parsed = createOrgSchema.safeParse({ name: org.name, slug: org.slug });
              if (!parsed.success) {
                throw new APIError("BAD_REQUEST", { message: parsed.error.issues[0]!.message });
              }
            },
            afterCreateOrganization: async ({ organization: org, user }) => {
              await withTransaction((session) =>
                provisionOrganization(
                  {
                    orgId: new Types.ObjectId(org.id),
                    actorId: new Types.ObjectId(user.id),
                    name: org.name,
                    slug: org.slug,
                  },
                  { session },
                ),
              );
            },
          },
        }),
        platformAdminPlugin(),
        platformAdminAllowlistPlugin(),
        ...(env.BILLING_ENABLED ? [stripePlugin()] : []),
        ...(options.trailingPlugins ?? []),
      ],
    });
  }

  box.auth = build();
  return box.auth;
}

export type Auth = ReturnType<typeof createAuth>;
