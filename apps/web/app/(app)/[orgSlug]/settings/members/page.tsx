import type { Metadata } from "next";

import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { MembersView } from "@/components/members/members-view";
import { requireOrg } from "@/lib/dal";
import { getMemberQuota, listInvitations, listMembers } from "@/lib/services/members";
import { listProjects } from "@/lib/services/projects";

export const metadata: Metadata = { title: "Members" };

export default async function MembersPage({ params }: PageProps<"/[orgSlug]/settings/members">) {
  const { orgSlug } = await params;
  const ctx = await requireOrg(orgSlug);
  const header = (
    <PageHeader
      title="Members"
      description="Invite people, set their role and, on Team and above, limit them to specific projects."
    />
  );
  if (!ctx.can("member:update") || !ctx.can("invitation:create")) {
    return (
      <>
        {header}
        <EmptyState title="Members are managed by Owners and Admins" mood="idle">
          Ask an Owner or Admin if you need access changed.
        </EmptyState>
      </>
    );
  }
  const [members, invitations, quota, projects] = await Promise.all([
    listMembers(ctx),
    listInvitations(ctx),
    getMemberQuota(ctx),
    listProjects(ctx),
  ]);
  return (
    <>
      {header}
      <MembersView
        orgSlug={orgSlug}
        actorRole={ctx.role}
        members={members}
        invitations={invitations}
        quota={quota}
        projects={projects.map(({ id, name, color }) => ({ id, name, color }))}
      />
    </>
  );
}
