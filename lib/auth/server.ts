import "server-only";

import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { nextCookies } from "better-auth/next-js";
import { organization } from "better-auth/plugins";
import { Types } from "mongoose";

import { getMongoClient } from "@/lib/db/connect";
import { withTransaction } from "@/lib/db/transaction";
import { env } from "@/lib/env";
import { createOrgSchema } from "@/lib/validation/org";
import { provisionOrganization } from "@/lib/services/org-settings";
import { applyInvitationScope, clearMemberScope } from "@/lib/services/project-scope";
import { getPlanLimits } from "@/lib/billing/plans";
import { OrgSettingsModel } from "@/lib/db/models/org-settings";
import { ac, roles } from "./permissions";

const client = getMongoClient();

export const auth = betterAuth({
  appName: "Wisemail",
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  // Shared client: enables the adapter's transactions (requires a replica set, see `pnpm db:dev`).
  database: mongodbAdapter(client.db(), { client, transaction: true }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    // TODO(phase 2): turn on once system email (invites, verification) is wired.
    requireEmailVerification: false,
    autoSignIn: true,
  },
  // Endpoint rate limiting is only on for requests through /api/auth (not `auth.api` calls).
  rateLimit: { storage: "database" },
  plugins: [
    organization({
      ac,
      roles,
      creatorRole: "owner",
      // UCD UC-02: invitations expire after 7 days.
      invitationExpiresIn: 7 * 24 * 60 * 60,
      // Plan member limit (PRICING §3), enforced when an invitation is accepted, whichever way
      // the request arrives. The invite flow in `lib/services/members.ts` checks it earlier.
      membershipLimit: async (_user, org) => {
        const settings = await OrgSettingsModel.findOne({
          orgId: new Types.ObjectId(org.id),
        }).lean();
        const limit = getPlanLimits(settings?.plan ?? "free", settings?.limitOverrides).members;
        return limit ?? Number.MAX_SAFE_INTEGER;
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
    nextCookies(), // must be last
  ],
});

export type Auth = typeof auth;
