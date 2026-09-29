import "server-only";

import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";

import { auth } from "@/lib/auth/server";
import { roleHasPermission, type Permission, type Role } from "@/lib/auth/permissions";
import { provisionOrganization } from "@/lib/services/org-settings";
import {
  listUserOrgs,
  resolveOrgAccess,
  type OrgAccess,
  type OrgRef,
} from "@/lib/services/tenancy";
import { OrgSettingsModel } from "@/lib/db/models/org-settings";
import { withTransaction } from "@/lib/db/transaction";
import { Types } from "mongoose";

/**
 * Data Access Layer. Everything that decides who the caller is, or which org they act in, lives
 * here. Never take an orgId from client input: resolve the org from the slug and check the
 * verified user's membership. Return DTOs (plain, minimal objects), never raw documents.
 */

export type UserDTO = { id: string; name: string; email: string; image: string | null };
export type OrgContext = {
  user: UserDTO;
  org: OrgRef;
  role: Role;
  orgs: OrgRef[];
  can: (permission: Permission) => boolean;
};

export class ForbiddenError extends Error {
  readonly code = "forbidden";
  constructor(readonly permission: Permission) {
    super("You don't have permission to do that.");
    this.name = "ForbiddenError";
  }
}

/** Raw session lookup (no redirect). Cached per request. */
export const getSession = cache(async () => auth.api.getSession({ headers: await headers() }));

/** Redirects to /sign-in when there is no valid session. Cached per request. */
export const verifySession = cache(async () => {
  const session = await getSession();
  if (!session) redirect("/sign-in?expired=1");
  return {
    userId: session.user.id,
    activeOrganizationId:
      (session.session as { activeOrganizationId?: string | null }).activeOrganizationId ?? null,
  };
});

export const getCurrentUser = cache(async (): Promise<UserDTO> => {
  await verifySession();
  const session = (await getSession())!;
  const { id, name, email, image } = session.user;
  return { id, name, email, image: image ?? null };
});

/** Where a signed-in user lands after auth: their active org, else the first one, else onboarding. */
export async function getHomePath(): Promise<string> {
  const { userId, activeOrganizationId } = await verifySession();
  const orgs = await listUserOrgs(userId);
  const target = orgs.find((o) => o.id === activeOrganizationId) ?? orgs[0];
  return target ? `/${target.slug}` : "/onboarding";
}

export function buildOrgContext(user: UserDTO, access: OrgAccess, orgs: OrgRef[]): OrgContext {
  return {
    user,
    org: access.org,
    role: access.role,
    orgs,
    can: (permission) => roleHasPermission(access.role, permission),
  };
}

export type OrgContextResult =
  { status: "ok"; ctx: OrgContext } | { status: "unauthenticated" } | { status: "not_member" };

/**
 * Non-redirecting core of `requireOrg`, also used by server actions (which return typed errors
 * instead of redirecting). Resolves the org from the slug and checks the verified user's
 * membership; a missing org and a non-member are indistinguishable so slugs can't be probed.
 * Makes the org the session's active org.
 */
export const getOrgContext = cache(async (orgSlug: string): Promise<OrgContextResult> => {
  const session = await getSession();
  if (!session) return { status: "unauthenticated" };
  const userId = session.user.id;
  const activeOrganizationId =
    (session.session as { activeOrganizationId?: string | null }).activeOrganizationId ?? null;

  const access = await resolveOrgAccess(userId, orgSlug);
  if (!access) return { status: "not_member" };

  const orgs = await listUserOrgs(userId);
  const orgOid = new Types.ObjectId(access.org.id);

  // Self-heal: org_settings is created by the org-creation hook; re-provision if it is missing.
  if (!(await OrgSettingsModel.exists({ orgId: orgOid }))) {
    await withTransaction((tx) =>
      provisionOrganization(
        {
          orgId: orgOid,
          actorId: new Types.ObjectId(userId),
          name: access.org.name,
          slug: access.org.slug,
        },
        { session: tx },
      ),
    );
  }

  if (activeOrganizationId !== access.org.id) {
    // Best effort: cookies can't always be written while rendering; the session row still updates.
    try {
      await auth.api.setActiveOrganization({
        headers: await headers(),
        body: { organizationId: access.org.id },
      });
    } catch {}
  }

  const { id, name, email, image } = session.user;
  const user: UserDTO = { id, name, email, image: image ?? null };
  return { status: "ok", ctx: buildOrgContext(user, access, orgs) };
});

/** For pages and layouts: sign-in redirect for visitors, 404 for non-members. */
export async function requireOrg(orgSlug: string): Promise<OrgContext> {
  const result = await getOrgContext(orgSlug);
  if (result.status === "unauthenticated") redirect("/sign-in?expired=1");
  if (result.status === "not_member") notFound();
  return result.ctx;
}

/** Throws `ForbiddenError` unless the context's role grants `permission`. */
export function authorize(ctx: Pick<OrgContext, "can">, permission: Permission): void {
  if (!ctx.can(permission)) throw new ForbiddenError(permission);
}
