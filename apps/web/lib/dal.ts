import "server-only";

import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";

import { auth } from "@/lib/auth/server";
import { tagOrg, tagUser } from "@/lib/observability/context";
import { type Permission } from "@/lib/auth/permissions";
import {
  forgetOrgSettings,
  getOrgSettings,
  provisionOrganization,
} from "@/lib/services/org-settings";
import { loadProjectScope } from "@/lib/services/project-scope";
import { listUserOrgs, resolveOrgAccess } from "@/lib/services/tenancy";
import { withTransaction } from "@/lib/db/transaction";
import { Types } from "mongoose";

import {
  ForbiddenError,
  buildOrgContext,
  type OrgContext,
  type OrgContextResult,
  type UserDTO,
} from "@/lib/dal-types";

export {
  ForbiddenError,
  buildOrgContext,
  type OrgContext,
  type OrgContextResult,
  type UserDTO,
} from "@/lib/dal-types";

/**
 * Data Access Layer (Next.js RSC / server actions). API routes use `dal-request.ts` instead.
 */

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

/**
 * Non-redirecting core of `requireOrg`, also used by server actions. RSC path uses Next
 * `headers()`; HTTP APIs should call `getOrgContextFromHeaders` in `dal-request.ts`.
 */
export const getOrgContext = cache(async (orgSlug: string): Promise<OrgContextResult> => {
  const session = await getSession();
  if (!session) return { status: "unauthenticated" };
  const userId = session.user.id;
  const activeOrganizationId =
    (session.session as { activeOrganizationId?: string | null }).activeOrganizationId ?? null;

  const [access, orgs] = await Promise.all([
    resolveOrgAccess(userId, orgSlug),
    listUserOrgs(userId),
  ]);
  if (!access) return { status: "not_member" };

  const orgOid = new Types.ObjectId(access.org.id);

  const activeOrgPromise =
    activeOrganizationId !== access.org.id
      ? headers().then((hdrs) =>
          auth.api
            .setActiveOrganization({
              headers: hdrs,
              body: { organizationId: access.org.id },
            })
            .catch(() => undefined),
        )
      : Promise.resolve(undefined);

  const [settings, projectScope] = await Promise.all([
    getOrgSettings(orgOid),
    loadProjectScope({
      orgId: access.org.id,
      memberId: access.memberId,
      role: access.role,
    }),
  ]);
  if (settings?.suspended) {
    await activeOrgPromise;
    return { status: "suspended", org: access.org, reason: settings.suspended.reason };
  }

  if (!settings) {
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
    forgetOrgSettings(orgOid);
  }

  await activeOrgPromise;

  tagOrg(access.org.id);
  tagUser(userId);

  const { id, name, email, image } = session.user;
  const user: UserDTO = { id, name, email, image: image ?? null };
  return { status: "ok", ctx: buildOrgContext(user, access, orgs, projectScope) };
});

/** For pages and layouts: sign-in redirect for visitors, 404 for non-members. */
export async function requireOrg(orgSlug: string): Promise<OrgContext> {
  const result = await getOrgContext(orgSlug);
  if (result.status === "unauthenticated") redirect("/sign-in?expired=1");
  if (result.status === "not_member") notFound();
  if (result.status === "suspended") redirect(`/suspended/${result.org.slug}`);
  return result.ctx;
}

/** Throws `ForbiddenError` unless the context's role grants `permission`. */
export function authorize(ctx: Pick<OrgContext, "can">, permission: Permission): void {
  if (!ctx.can(permission)) throw new ForbiddenError(permission);
}
