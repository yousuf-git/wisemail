import "server-only";

import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { nextCookies } from "better-auth/next-js";
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

const client = getMongoClient();

/** A failed system email must not fail sign-up or sign-in; the person can ask for a new one. */
async function mailSafely(what: string, send: () => Promise<void>) {
  try {
    await send();
  } catch (error) {
    console.error(`[auth] could not send the ${what} email`, error);
  }
}

type OtpType = "email-verification" | "forget-password";
/**
 * Mints a code for `email` without sending it, so the link emails can carry both. Wired to
 * `auth.api.createVerificationOTP` right after `auth` exists (callbacks only run later).
 */
const issueOtp = (args: { body: { email: string; type: OtpType } }): Promise<string> =>
  auth.api.createVerificationOTP(args);

const social = enabledSocialProviders();

export const auth = betterAuth({
  appName: "Wisemail",
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  // Shared client: enables the adapter's transactions (requires a replica set, see `pnpm db:dev`).
  database: mongodbAdapter(client.db(), { client, transaction: true }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    // Sign-in is refused until the address is confirmed, and sign-up does not create a session.
    // Invitations rely on this: a verified email is the proof of who may accept one.
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
        const code = await issueOtp({ body: { email: user.email, type: "email-verification" } });
        await sendVerificationEmail(user.email, { name: user.name, url, code });
      });
    },
  },
  // Google and GitHub switch on when both their env values are set. Their emails arrive verified,
  // so social sign-ups skip the confirmation step. An existing password account is linked only
  // when its own address is verified too (`requireLocalEmailVerified`), so nobody can pre-register
  // someone else's address and inherit their social login.
  socialProviders: {
    ...(social.includes("google")
      ? { google: { clientId: env.GOOGLE_CLIENT_ID!, clientSecret: env.GOOGLE_CLIENT_SECRET! } }
      : {}),
    ...(social.includes("github")
      ? { github: { clientId: env.GITHUB_CLIENT_ID!, clientSecret: env.GITHUB_CLIENT_SECRET! } }
      : {}),
  },
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ["google", "github"],
      requireLocalEmailVerified: true,
    },
  },
  // Endpoint rate limiting is only on for requests through /api/auth (not `auth.api` calls).
  rateLimit: { storage: "database" },
  plugins: [
    // Six-digit codes next to the links (verify email, reset password). Codes are requested by the
    // link emails above; the HTTP `send-verification-otp` endpoint also works for a plain resend.
    emailOTP({
      otpLength: OTP_LENGTH,
      expiresIn: OTP_EXPIRES_IN,
      allowedAttempts: OTP_ALLOWED_ATTEMPTS,
      // Codes exist for verification and reset only; nobody signs in or signs up with one.
      disableSignUp: true,
      storeOTP: "hashed",
      rateLimit: { window: 60, max: 5 },
      sendVerificationOTP: async ({ email, otp, type }) => {
        if (type !== "email-verification" && type !== "forget-password") return;
        const user = await getUserName(email);
        // Unknown addresses get no email and the same response (no account enumeration).
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
      // Accepting, rejecting or reading an invitation by id needs a verified session email, even
      // when the request skips our invite page and calls Better Auth's HTTP endpoints directly.
      requireEmailVerificationOnInvitation: true,
      // UCD UC-02: invitations expire after 7 days.
      invitationExpiresIn: 7 * 24 * 60 * 60,
      // Plan member limit (PRICING §3), enforced when an invitation is accepted, whichever way
      // the request arrives. The invite flow in `lib/services/members.ts` checks it earlier.
      membershipLimit: async (_user, org) => {
        const e = await getEntitlements(new Types.ObjectId(org.id));
        return e.limits.members ?? Number.MAX_SAFE_INTEGER;
      },
      organizationHooks: {
        // Projects chosen at invite time become the new member's scope.
        afterAcceptInvitation: async ({ invitation, member }) => {
          await applyInvitationScope({
            invitationId: invitation.id,
            orgId: invitation.organizationId,
            memberId: member.id,
            role: member.role,
          });
        },
        // A removed member's scope never outlives them (also when removed via the HTTP API).
        afterRemoveMember: async ({ member, organization: org }) => {
          await clearMemberScope(new Types.ObjectId(org.id), new Types.ObjectId(member.id));
          // Tour progress is per user and org (DBD §5).
          await deleteTourProgress(new Types.ObjectId(org.id), new Types.ObjectId(member.userId));
        },
        // The client can call /api/auth/organization/create directly, so slug rules live here too.
        beforeCreateOrganization: async ({ organization: org }) => {
          const parsed = createOrgSchema.safeParse({ name: org.name, slug: org.slug });
          if (!parsed.success) {
            throw new APIError("BAD_REQUEST", { message: parsed.error.issues[0]!.message });
          }
        },
        // Runs right after the org and its owner member are created. org_settings and the audit
        // entry are written together in one transaction; both are idempotent, and `requireOrg`
        // re-provisions if this ever failed mid-flight.
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
    // Platform admin panel: ban, sessions, impersonation, allowlist bootstrap (lib/admin).
    platformAdminPlugin(),
    platformAdminAllowlistPlugin(),
    // Subscriptions with the organization as Stripe customer; only when billing is on.
    ...(env.BILLING_ENABLED ? [stripePlugin()] : []),
    nextCookies(), // must be last
  ],
});

/** Display name of the user with this address, or null when there is none. */
async function getUserName(email: string): Promise<string | null> {
  const found = await (await auth.$context).internalAdapter.findUserByEmail(email.toLowerCase());
  return found ? found.user.name : null;
}

export type Auth = typeof auth;
