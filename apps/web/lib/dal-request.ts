import "server-only";

import { Types } from "mongoose";

import { auth } from "@/lib/auth/runtime";
import { tagOrg, tagUser } from "@/lib/observability/context";
import {
  forgetOrgSettings,
  getOrgSettings,
  provisionOrganization,
} from "@/lib/services/org-settings";
import { loadProjectScope } from "@/lib/services/project-scope";
import { listUserOrgs, resolveOrgAccess } from "@/lib/services/tenancy";
import { withTransaction } from "@/lib/db/transaction";

import { buildOrgContext, type OrgContextResult, type UserDTO } from "@/lib/dal-types";

/**
 * Framework-agnostic session + org resolution from request headers. Used by `/api/*` (Next and
 * Fastify). RSC / server actions keep using `getSession` / `getOrgContext` in `dal.ts` (Next
 * `headers()` + React `cache`).
 */

export async function getSessionFromHeaders(hdrs: Headers) {
  return auth.api.getSession({ headers: hdrs });
}

export async function getOrgContextFromHeaders(
  orgSlug: string,
  hdrs: Headers,
): Promise<OrgContextResult> {
  const session = await getSessionFromHeaders(hdrs);
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
      ? auth.api
          .setActiveOrganization({
            headers: hdrs,
            body: { organizationId: access.org.id },
          })
          .catch(() => undefined)
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
}
