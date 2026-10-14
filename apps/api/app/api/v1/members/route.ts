import {
  getMemberQuota,
  listInvitations,
  listMembers,
} from "@/lib/services/members";
import { listProjects } from "@/lib/services/projects";
import { orgRoute } from "../_lib/org-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `GET /api/v1/members?orgSlug=` → members, invites, quota, projects, actor role. */
export function GET(request: Request) {
  return orgRoute(request, async ({ ctx }) => {
    const can = {
      read: ctx.can("member:update") && ctx.can("invitation:create"),
      invite: ctx.can("invitation:create"),
      update: ctx.can("member:update"),
      delete: ctx.can("member:delete"),
    };
    if (!can.read) {
      return {
        members: [],
        invitations: [],
        quota: {
          used: 0,
          limit: null,
          planLabel: "",
          nextTierLabel: null,
          scopesAllowed: false,
        },
        projects: [],
        actorRole: ctx.role,
        can,
      };
    }

    const [members, invitations, quota, projects] = await Promise.all([
      listMembers(ctx),
      listInvitations(ctx),
      getMemberQuota(ctx),
      ctx.can("project:read")
        ? listProjects(ctx)
        : Promise.resolve([] as Awaited<ReturnType<typeof listProjects>>),
    ]);

    return {
      members,
      invitations,
      quota,
      projects: projects.map(({ id, name, color }) => ({ id, name, color })),
      actorRole: ctx.role,
      can,
    };
  });
}
